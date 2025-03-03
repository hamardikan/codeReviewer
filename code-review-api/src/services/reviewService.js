'use strict';

const { v4: uuid } = require('uuid');
const geminiService = require('./geminiService');
const storageService = require('./storageService');
const { createCodeReviewPrompt, createRepairPrompt } = require('../utils/prompts');
const { parseReviewText, repairWithRegex } = require('../utils/parser');
const { ReviewData, ReviewStatus } = require('../models/Review');
const logger = require('../utils/logger');

/**
 * Maximum number of attempts to retry parsing 
 */
const MAX_PARSE_ATTEMPTS = 3;

/**
 * Minimum content length to attempt parsing (in characters)
 */
const MIN_CONTENT_FOR_PARSING = 1000;

/**
 * Starts a new code review
 * Returns the review ID for subsequent polling
 */
async function startReview(code, language, filename) {
    try {
        // Generate a unique ID for this review
        const reviewId = uuid();
        logger.info(`Starting review with ID: ${reviewId}, language: ${language}`);

        // Create a new review
        const review = new ReviewData({
            id: reviewId,
            status: ReviewStatus.QUEUED,
            language,
            filename
        });

        // Save the initial review
        await storageService.saveReview(reviewId, review);

        // Start background processing with setTimeout to ensure it runs in a separate event loop cycle
        // This is crucial for proper asynchronous execution
        setTimeout(() => {
            processReviewInBackground(reviewId, code, language)
                .catch(error => {
                    logger.error(`Background processing error for ${reviewId}:`, error);
                });
        }, 0);

        logger.info(`Review ${reviewId} created and scheduled for background processing`);
        return reviewId;
    } catch (error) {
        logger.error('Error starting review:', error);
        throw error;
    }
}

/**
 * Processes a review in the background
 * Improved to handle content truncation and ensure complete responses
 */
async function processReviewInBackground(reviewId, code, language) {
    try {
        logger.info(`===== STARTING REVIEW ${reviewId} =====`);
        logger.info(`Language: ${language}, Code length: ${code.length} characters`);

        // Update status to processing
        await storageService.updateReview(reviewId, { status: ReviewStatus.PROCESSING });
        logger.debug(`Updated review ${reviewId} status to PROCESSING`);

        // Create the prompt for the code review
        const prompt = createCodeReviewPrompt(code, language);
        logger.debug(`Created prompt for ${language} code review, prompt length: ${prompt.length}`);

        // Start timing the Gemini API call
        const startTime = Date.now();
        logger.info(`Calling Gemini API for review ${reviewId}`);

        // Process the response in chunks
        let chunkCount = 0;
        let parseAttempts = 0;
        let lastParseAttemptChunkCount = 0;

        logger.debug(`Starting stream for review ${reviewId}`);
        const streamGenerator = geminiService.streamResponse(prompt);
        logger.debug(`Stream generator created for review ${reviewId}`);

        for await (const chunk of streamGenerator) {
            logger.debug(`Received chunk for review ${reviewId}: ${chunk.substring(0, 50)}...`);
            await storageService.appendChunk(reviewId, chunk);

            chunkCount++;
            if (chunkCount % 10 === 0) {
                const elapsedTime = Math.round((Date.now() - startTime) / 1000);
                logger.debug(`Review ${reviewId}: Processed ${chunkCount} chunks (${elapsedTime}s elapsed)`);

                // Periodically attempt early parsing if we have enough content
                // This helps us detect completion and can provide partial results to the user
                if (chunkCount >= 20 &&
                    chunkCount > lastParseAttemptChunkCount + 15 &&
                    parseAttempts < MAX_PARSE_ATTEMPTS) {

                    const review = await storageService.getReview(reviewId);
                    if (review) {
                        const rawText = review.getRawText();

                        // Only attempt parsing if we have significant content
                        if (rawText.length > MIN_CONTENT_FOR_PARSING) {
                            logger.debug(`Attempting early parse at chunk ${chunkCount}, text length: ${rawText.length}`);

                            const parseResult = parseReviewText(rawText);
                            if (parseResult.success && parseResult.result) {
                                logger.info(`Early parse successful at chunk ${chunkCount}`);
                                await storageService.updateReview(reviewId, { parsedResponse: parseResult.result });
                            } else {
                                logger.debug(`Early parse attempt failed: ${parseResult.error}`);
                            }

                            parseAttempts++;
                            lastParseAttemptChunkCount = chunkCount;
                        }
                    }
                }
            }
        }

        // CRITICAL: Update the status to COMPLETED after streaming is done
        await storageService.updateReview(reviewId, { status: ReviewStatus.COMPLETED });
        logger.info(`Updated review ${reviewId} status to COMPLETED`);

        // Try to parse the complete response
        const review = await storageService.getReview(reviewId);
        if (review) {
            const rawText = review.getRawText();
            logger.debug(`Parsing final raw text for review ${reviewId}, length: ${rawText.length}`);

            const parseResult = parseReviewText(rawText);

            if (parseResult.success && parseResult.result) {
                logger.info(`Successfully parsed response for review ${reviewId}`);
                logger.debug(`Found ${parseResult.result.suggestions.length} suggestions`);
                await storageService.updateReview(reviewId, { parsedResponse: parseResult.result });
            } else {
                logger.warn(`Failed to parse response for review ${reviewId}: ${parseResult.error}`);

                // If normal parsing fails, attempt repair before giving up
                logger.info(`Attempting automatic repair for review ${reviewId}`);
                const repairResult = repairWithRegex(rawText);

                if (repairResult.success && repairResult.result) {
                    logger.info(`Auto-repair successful for review ${reviewId}`);
                    await storageService.updateReview(reviewId, { parsedResponse: repairResult.result });
                } else {
                    // If regex repair fails too, try one more time with a Gemini API call to repair
                    logger.info(`Regex repair failed, attempting AI-based repair for review ${reviewId}`);
                    const aiRepairResult = await repairWithAI(rawText, language);

                    if (aiRepairResult.success && aiRepairResult.result) {
                        logger.info(`AI-based repair successful for review ${reviewId}`);
                        await storageService.updateReview(reviewId, { parsedResponse: aiRepairResult.result });
                    } else {
                        logger.error(`All parsing and repair attempts failed for review ${reviewId}`);
                    }
                }
            }
        }

        const totalTime = Math.round((Date.now() - startTime) / 1000);
        logger.info(`===== COMPLETED REVIEW ${reviewId} in ${totalTime}s with ${chunkCount} chunks =====`);
    } catch (error) {
        logger.error(`===== ERROR PROCESSING REVIEW ${reviewId} =====`);
        logger.error(`Error details:`, error);

        // Update status to error
        await storageService.updateReview(reviewId, {
            status: ReviewStatus.ERROR,
            error: error.message || 'Unknown error'
        });
        logger.info(`Updated review ${reviewId} status to ERROR`);
    }
}

/**
 * Gets the current status of a review
 * Improved to better handle completion detection
 */
async function getReviewStatus(reviewId) {
    try {
        const review = await storageService.getReview(reviewId);

        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }

        // Force complete status if there's significant content but status is still processing
        let forceComplete = false;

        if (review.status === ReviewStatus.PROCESSING && review.chunks.length > 0) {
            const rawText = review.getRawText();

            // More comprehensive check for completion
            if (rawText.length > 1000) {
                // Check for completion based on content markers
                const hasSummary = /SUMMARY:|Summary:|summary:/i.test(rawText);
                const hasSuggestions = /SUGGESTIONS:|Suggestions:|suggestions:/i.test(rawText);
                const hasCleanCode = /CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:/i.test(rawText);

                // If we have all three sections, examine the clean code section more carefully
                if (hasSummary && hasSuggestions && hasCleanCode) {
                    const cleanCodeMatch = rawText.match(/(?:CLEAN[_\s]CODE:|Clean[_\s]Code:|clean[_\s]code:)([\s\S]*?)$/i);

                    // If we have substantial clean code content, force complete
                    if (cleanCodeMatch && cleanCodeMatch[1] && cleanCodeMatch[1].length > 500) {
                        logger.info(`Review ${reviewId} appears complete based on content but status is still processing`);
                        forceComplete = true;
                    }
                }
            }
        }

        // Another check: if we have parsed response with sufficient clean code, consider it complete
        if (review.parsedResponse &&
            review.parsedResponse.cleanCode &&
            review.parsedResponse.cleanCode.length > 300) {
            forceComplete = true;
        }

        return {
            reviewId,
            status: forceComplete ? ReviewStatus.COMPLETED : review.status,
            chunks: review.chunks,
            lastUpdated: review.lastUpdated,
            isComplete: forceComplete || review.isComplete() || review.status === ReviewStatus.COMPLETED || review.status === ReviewStatus.ERROR,
            error: review.error
        };
    } catch (error) {
        logger.error(`Error getting status for review ${reviewId}:`, error);
        throw error;
    }
}

/**
 * Gets the complete result of a review
 * Improved to handle various edge cases and ensure complete responses
 */
async function getReviewResult(reviewId) {
    try {
        const review = await storageService.getReview(reviewId);

        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }

        const rawText = review.getRawText();

        // Force completed status if we have enough content
        // This is a safety measure to ensure reviews don't get stuck
        if (rawText && rawText.length > 1000 && review.status === 'processing') {
            logger.info(`Review ${reviewId} has significant content but status is still processing, forcing completion`);
            await storageService.updateReview(reviewId, { status: ReviewStatus.COMPLETED });
            review.status = ReviewStatus.COMPLETED;
        }

        // If we already have a parsed response, verify it has complete clean code
        if (review.parsedResponse) {
            // Check if clean code appears incomplete (suspiciously short)
            if (review.parsedResponse.cleanCode && review.parsedResponse.cleanCode.length < 300 && rawText.length > 2000) {
                logger.warn(`Review ${reviewId} has parsed response but clean code seems incomplete (${review.parsedResponse.cleanCode.length} chars). Attempting repair.`);

                // Try to repair the response to get better clean code
                const repairResult = repairWithRegex(rawText);

                if (repairResult.success &&
                    repairResult.result &&
                    repairResult.result.cleanCode &&
                    repairResult.result.cleanCode.length > review.parsedResponse.cleanCode.length) {

                    logger.info(`Repaired clean code is better (${repairResult.result.cleanCode.length} chars). Updating.`);

                    // Update with the better clean code but keep existing suggestions
                    const improvedParsedResponse = {
                        ...review.parsedResponse,
                        cleanCode: repairResult.result.cleanCode
                    };

                    await storageService.updateReview(reviewId, { parsedResponse: improvedParsedResponse });
                    review.parsedResponse = improvedParsedResponse;
                }
            }

            logger.debug(`Review ${reviewId} already has parsed response, returning it`);

            return {
                reviewId,
                status: review.status,
                rawText,
                parsedResponse: review.parsedResponse,
                isComplete: true, // Force isComplete to true if we have a parsed response
                error: review.error
            };
        }

        // Try to parse the raw text
        logger.debug(`Attempting to parse raw text for review ${reviewId}, length: ${rawText?.length || 0}`);
        const parseResult = parseReviewText(rawText || '');

        // If parsing was successful, update the stored review and mark as completed
        if (parseResult.success && parseResult.result) {
            logger.info(`Successfully parsed review ${reviewId}, updating status to COMPLETED`);

            // Update with parsedResponse and set status to completed
            await storageService.updateReview(reviewId, {
                parsedResponse: parseResult.result,
                status: ReviewStatus.COMPLETED
            });

            return {
                reviewId,
                status: ReviewStatus.COMPLETED, // Explicitly set to COMPLETED
                rawText,
                parsedResponse: parseResult.result,
                isComplete: true,
                error: null
            };
        }

        // If parsing failed, try repair with regex
        logger.warn(`Standard parsing failed for review ${reviewId}, attempting repair`);
        const repairResult = repairWithRegex(rawText || '');

        if (repairResult.success && repairResult.result) {
            logger.info(`Successfully repaired review ${reviewId}, updating status to COMPLETED`);

            // Update with repaired response and set status to completed
            await storageService.updateReview(reviewId, {
                parsedResponse: repairResult.result,
                status: ReviewStatus.COMPLETED
            });

            return {
                reviewId,
                status: ReviewStatus.COMPLETED, // Explicitly set to COMPLETED
                rawText,
                parsedResponse: repairResult.result,
                isComplete: true,
                error: null
            };
        }

        // If parsing failed but we have content and the review isn't in error state,
        // still return the raw content but with a parse error
        logger.warn(`All parsing attempts failed for review ${reviewId}: ${parseResult.error}`);

        return {
            reviewId,
            status: review.status,
            rawText: rawText || '',
            parseError: parseResult.error || 'Failed to parse review content',
            isComplete: review.isComplete() || rawText?.length > 1000, // Consider complete if we have significant content
            error: review.error
        };
    } catch (error) {
        logger.error(`Error getting result for review ${reviewId}:`, error);
        throw error;
    }
}

/**
 * Repairs a malformed review response
 */
async function repairReview(reviewId, rawText, language) {
    try {
        logger.info(`===== REPAIRING REVIEW ${reviewId} =====`);

        // First try regex-based repair
        let repaired = repairWithRegex(rawText);

        // If regex fails, use another AI call to structure it
        if (!repaired.success) {
            logger.debug('Regex repair failed, attempting AI-based repair');
            repaired = await repairWithAI(rawText, language);
        }

        // If we have a review ID, update the review
        if (repaired.success && reviewId && repaired.result) {
            const review = await storageService.getReview(reviewId);

            if (review) {
                // Update the parsed response and status
                await storageService.updateReview(reviewId, {
                    parsedResponse: repaired.result,
                    status: ReviewStatus.COMPLETED
                });

                logger.info(`Updated repaired review: ${reviewId}`);
            }
        }

        logger.info(`===== REPAIR COMPLETE: ${repaired.success ? 'SUCCESS' : 'FAILED'} =====`);
        return repaired;
    } catch (error) {
        logger.error('Error repairing review:', error);
        throw error;
    }
}

/**
 * Uses the Gemini API to repair a malformed response
 * Enhanced with more specific instructions to ensure complete clean code
 */
async function repairWithAI(rawText, language = 'javascript') {
    try {
        logger.info(`===== STARTING REPAIR (${language}) =====`);
        logger.debug(`Raw text length to repair: ${rawText.length} characters`);

        // Create a repair prompt with specific instructions about clean code completeness
        const prompt = createRepairPrompt(rawText, language);
        logger.debug(`Created repair prompt, length: ${prompt.length}`);

        // Request the AI to fix the formatting
        const startTime = Date.now();
        logger.info('Calling Gemini API for repair');

        // Increased token limit for repair requests specifically
        const formattedText = await geminiService.generateContent(prompt);

        const repairTime = Math.round((Date.now() - startTime) / 1000);
        logger.info(`Received repaired text in ${repairTime}s, length: ${formattedText.length}`);

        // Parse the reformatted text
        let parseResult = parseReviewText(formattedText);

        // If the standard parsing fails, try the regex-based repair as a fallback
        if (!parseResult.success) {
            logger.warn('Standard parsing of repaired text failed, trying regex repair');
            parseResult = repairWithRegex(formattedText);

            // If regex repair also fails but we have the original raw text, try regex on that
            if (!parseResult.success && rawText) {
                logger.warn('Regex repair on AI-generated text failed, trying regex repair on original text');
                parseResult = repairWithRegex(rawText);
            }
        }

        // If we have a successful parse but the clean code seems too short, try another approach
        if (parseResult.success && parseResult.result) {
            const cleanCodeLength = parseResult.result.cleanCode.length;

            if (cleanCodeLength < 500 && rawText.length > 2000) {
                logger.warn(`Parsed clean code is suspiciously short (${cleanCodeLength} chars), trying dedicated clean code extraction`);

                // Try to extract a better clean code section from the raw text
                const extractedCleanCode = extractCleanCode(rawText);

                if (extractedCleanCode && extractedCleanCode.length > cleanCodeLength * 1.5) {
                    logger.info(`Found better clean code with length ${extractedCleanCode.length}, using that instead`);
                    parseResult.result.cleanCode = extractedCleanCode;
                }
            }

            logger.info('Successfully parsed repaired response');
            logger.debug(`Found ${parseResult.result.suggestions.length} suggestions and clean code of length ${parseResult.result.cleanCode.length}`);
        } else {
            logger.warn(`Failed to parse repaired response: ${parseResult.error}`);
        }

        logger.info(`===== COMPLETED REPAIR (${parseResult.success ? 'SUCCESS' : 'FAILED'}) =====`);

        return parseResult;
    } catch (error) {
        logger.error('===== ERROR DURING REPAIR =====');
        logger.error('Error details:', error);

        // Try regex repair as a last resort if the AI-based repair fails
        logger.info('AI repair failed, attempting regex repair as fallback');
        try {
            const regexRepairResult = repairWithRegex(rawText);
            if (regexRepairResult.success) {
                logger.info('Fallback regex repair successful');
                return regexRepairResult;
            }
        } catch (innerError) {
            logger.error('Even fallback regex repair failed:', innerError);
        }

        return {
            success: false,
            error: error.message || 'Unknown error during AI repair'
        };
    }
}

/**
 * Creates a prompt for repairing malformed responses
 * Enhanced to emphasize the importance of complete clean code
 */
function createRepairPrompt(rawText, language = 'javascript') {
    return `
  I received the following ${language} code review, but it doesn't follow the required format or the clean code section is incomplete. 
  Please restructure it into exactly this format:
  
  SUMMARY:
  [overall feedback about the code]
  
  SUGGESTIONS:
  LINE: [line number]
  ORIGINAL: [original code]
  SUGGESTED: [suggested improvement]
  EXPLANATION: [explanation of why this change improves the code]
  
  CLEAN_CODE:
  [complete improved version of the code]
  
  Here is the review text that needs to be reformatted:
  ${rawText}
  
  IMPORTANT GUIDELINES:
  1. Follow the exact formatting with the section headers exactly as shown
  2. Make sure to preserve all the technical content while reformatting it
  3. Limit to a maximum of 10-15 suggestions, focusing on the most important ones
  4. Do not include duplicate suggestions that address the same issue
  5. Ensure all code sections are properly formatted with correct indentation
  6. THE CLEAN CODE SECTION MUST BE COMPLETE AND INCLUDE THE ENTIRE CODEBASE with all improvements integrated
  7. If the clean code section in the original response is incomplete, please reconstruct it by implementing all the suggestions on the original code
  8. Do not truncate or abbreviate any part of the clean code - it must be complete and runnable
  9. The clean code section should be the highest priority - ensure it's complete and properly formatted
  `;
}ß

module.exports = {
    startReview,
    getReviewStatus,
    getReviewResult,
    repairReview
};