'use strict';

/**
 * Review status enumeration
 */
const ReviewStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
  REPAIRING: 'repairing'
};

/**
 * Code suggestion structure
 */
class CodeSuggestion {
  constructor(data = {}) {
    this.id = data.id || '';
    this.lineNumber = data.lineNumber || 0;
    this.originalCode = data.originalCode || '';
    this.suggestedCode = data.suggestedCode || '';
    this.explanation = data.explanation || '';
    this.accepted = data.accepted === null ? null : Boolean(data.accepted);
  }
}

/**
 * Review response structure
 */
class CodeReviewResponse {
  constructor(data = {}) {
    this.summary = data.summary || '';
    this.suggestions = Array.isArray(data.suggestions) 
      ? data.suggestions.map(s => new CodeSuggestion(s))
      : [];
    this.cleanCode = data.cleanCode || '';
  }
}

/**
 * Full review data structure
 */
class ReviewData {
  constructor(data = {}) {
    this.id = data.id || '';
    this.status = data.status || ReviewStatus.QUEUED;
    this.chunks = Array.isArray(data.chunks) ? [...data.chunks] : [];
    this.error = data.error || null;
    this.timestamp = data.timestamp || Date.now();
    this.lastUpdated = data.lastUpdated || Date.now();
    this.parsedResponse = data.parsedResponse ? new CodeReviewResponse(data.parsedResponse) : null;
    this.language = data.language || 'javascript';
    this.filename = data.filename || null;
    this.expiresAt = data.expiresAt || null;
  }

  /**
   * Update review with new data
   */
  update(data) {
    if (data.status) this.status = data.status;
    if (data.error) this.error = data.error;
    if (data.parsedResponse) this.parsedResponse = new CodeReviewResponse(data.parsedResponse);
    this.lastUpdated = Date.now();
    return this;
  }

  /**
   * Append a chunk to the review
   */
  appendChunk(chunk) {
    this.chunks.push(chunk);
    this.lastUpdated = Date.now();
    return this;
  }

  /**
   * Get complete raw text
   */
  getRawText() {
    return this.chunks.join('');
  }

  /**
   * Check if the review is complete
   */
  isComplete() {
    return this.status === ReviewStatus.COMPLETED || this.status === ReviewStatus.ERROR;
  }
}

module.exports = {
  ReviewStatus,
  CodeSuggestion,
  CodeReviewResponse,
  ReviewData
};