/**
 * Data access layer for the scanner database.
 */
export class CallRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this._upsertCall = this.db.prepare(`
      INSERT INTO calls (external_id, source_portal, title, url, programme, description, full_text, deadline_date, opening_date, budget, status, topics)
      VALUES (@externalId, @sourcePortal, @title, @url, @programme, @description, @fullText, @deadlineDate, @openingDate, @budget, @status, @topics)
      ON CONFLICT(external_id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        description = CASE WHEN length(excluded.description) > length(calls.description) THEN excluded.description ELSE calls.description END,
        full_text = CASE WHEN length(excluded.full_text) > length(calls.full_text) THEN excluded.full_text ELSE calls.full_text END,
        deadline_date = COALESCE(NULLIF(excluded.deadline_date, ''), calls.deadline_date),
        budget = COALESCE(NULLIF(excluded.budget, ''), calls.budget),
        status = excluded.status,
        last_seen_at = datetime('now'),
        updated_at = datetime('now')
    `);

    this._updateScore = this.db.prepare(`
      UPDATE calls SET
        relevance_score = @relevanceScore,
        reasoning = @reasoning,
        matched_domains = @matchedDomains,
        suggested_role = @suggestedRole,
        action_items = @actionItems,
        risk_flags = @riskFlags,
        scored_at = datetime('now'),
        updated_at = datetime('now')
      WHERE external_id = @externalId
    `);

    this._getUnscored = this.db.prepare(`
      SELECT * FROM calls WHERE scored_at IS NULL ORDER BY created_at DESC
    `);

    this._getRelevant = this.db.prepare(`
      SELECT * FROM calls
      WHERE relevance_score >= @minScore
        AND (deadline_date = '' OR deadline_date >= date('now'))
      ORDER BY relevance_score DESC, deadline_date ASC
    `);

    this._getForBriefing = this.db.prepare(`
      SELECT * FROM calls
      WHERE relevance_score >= @minScore
        AND (included_in_briefing IS NULL OR included_in_briefing < @since)
        AND (deadline_date = '' OR deadline_date >= date('now'))
      ORDER BY relevance_score DESC
      LIMIT @limit
    `);

    this._markBriefed = this.db.prepare(`
      UPDATE calls SET included_in_briefing = @date, updated_at = datetime('now')
      WHERE external_id = @externalId
    `);

    this._getCallById = this.db.prepare(`SELECT * FROM calls WHERE external_id = ?`);

    this._getStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN scored_at IS NOT NULL THEN 1 ELSE 0 END), 0) as scored,
        COALESCE(SUM(CASE WHEN relevance_score >= 0.6 THEN 1 ELSE 0 END), 0) as high_relevance,
        COALESCE(SUM(CASE WHEN relevance_score >= 0.4 AND relevance_score < 0.6 THEN 1 ELSE 0 END), 0) as moderate_relevance,
        COALESCE(SUM(CASE WHEN deadline_date != '' AND deadline_date < date('now') THEN 1 ELSE 0 END), 0) as expired
      FROM calls
    `);
  }

  /**
   * Upsert a raw call from a scraper.
   * @param {import('../scrapers/base.js').RawCall} call
   * @returns {{ isNew: boolean }}
   */
  upsertCall(call) {
    const existing = this._getCallById.get(call.externalId);
    this._upsertCall.run({
      externalId: call.externalId,
      sourcePortal: call.sourcePortal,
      title: call.title,
      url: call.url,
      programme: call.programme || "",
      description: call.description || "",
      fullText: call.fullText || "",
      deadlineDate: call.deadlineDate || "",
      openingDate: call.openingDate || "",
      budget: call.budget || "",
      status: call.status || "open",
      topics: JSON.stringify(call.topics || []),
    });
    return { isNew: !existing };
  }

  /**
   * Batch upsert calls within a transaction.
   * @param {import('../scrapers/base.js').RawCall[]} calls
   * @returns {{ total: number, new: number }}
   */
  upsertBatch(calls) {
    let newCount = 0;
    const txn = this.db.transaction((items) => {
      for (const call of items) {
        const { isNew } = this.upsertCall(call);
        if (isNew) newCount++;
      }
    });
    txn(calls);
    return { total: calls.length, new: newCount };
  }

  /**
   * Update scoring results for a call.
   * @param {import('../analysis/scorer.js').ScoredCall} score
   */
  updateScore(score) {
    this._updateScore.run({
      externalId: score.externalId,
      relevanceScore: score.relevanceScore,
      reasoning: score.reasoning,
      matchedDomains: JSON.stringify(score.matchedDomains),
      suggestedRole: score.suggestedRole,
      actionItems: score.actionItems,
      riskFlags: score.riskFlags,
    });
  }

  /** Get calls that haven't been scored yet. */
  getUnscored() {
    return this._getUnscored.all();
  }

  /** Get all calls above a relevance threshold. */
  getRelevant(minScore = 0.4) {
    return this._getRelevant.all({ minScore });
  }

  /** Get calls for the weekly briefing. */
  getForBriefing(minScore = 0.4, since = "", limit = 30) {
    return this._getForBriefing.all({ minScore, since, limit });
  }

  /** Mark calls as included in a briefing. */
  markBriefed(externalIds, date) {
    const txn = this.db.transaction((ids) => {
      for (const externalId of ids) {
        this._markBriefed.run({ externalId, date });
      }
    });
    txn(externalIds);
  }

  /** Get database statistics. */
  getStats() {
    return this._getStats.get();
  }

  // --- Scan run tracking ---

  startScanRun() {
    const result = this.db.prepare(
      `INSERT INTO scan_runs (status) VALUES ('running')`
    ).run();
    return result.lastInsertRowid;
  }

  completeScanRun(runId, stats) {
    this.db.prepare(`
      UPDATE scan_runs SET
        completed_at = datetime('now'),
        calls_found = @callsFound,
        calls_new = @callsNew,
        calls_scored = @callsScored,
        errors = @errors,
        status = 'completed'
      WHERE id = @id
    `).run({
      id: runId,
      callsFound: stats.callsFound || 0,
      callsNew: stats.callsNew || 0,
      callsScored: stats.callsScored || 0,
      errors: JSON.stringify(stats.errors || []),
    });
  }

  failScanRun(runId, errors) {
    this.db.prepare(`
      UPDATE scan_runs SET
        completed_at = datetime('now'),
        errors = @errors,
        status = 'failed'
      WHERE id = @id
    `).run({ id: runId, errors: JSON.stringify(errors) });
  }

  // --- Briefing tracking ---

  saveBriefing(briefing) {
    const result = this.db.prepare(`
      INSERT INTO briefings (recipients, calls_included, subject, body_html, body_text, status)
      VALUES (@recipients, @callsIncluded, @subject, @bodyHtml, @bodyText, @status)
    `).run({
      recipients: JSON.stringify(briefing.recipients || []),
      callsIncluded: briefing.callsIncluded || 0,
      subject: briefing.subject || "",
      bodyHtml: briefing.bodyHtml || "",
      bodyText: briefing.bodyText || "",
      status: briefing.status || "draft",
    });
    return result.lastInsertRowid;
  }

  markBriefingSent(id) {
    this.db.prepare(`
      UPDATE briefings SET sent_at = datetime('now'), status = 'sent' WHERE id = ?
    `).run(id);
  }
}
