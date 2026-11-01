const mammoth = require('mammoth');

async function extractTextFromDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value; 
    } catch (error) {
        console.error("Error reading file with Mammoth:", error);
        throw error;
    }
}

async function extractTextFromDocxBuffer(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer: buffer });
        return result.value; 
    } catch (error) {
        console.error("Error reading buffer with Mammoth:", error);
        throw error;
    }
}

/**
 * Clean Exam Auditor & Template Extraction Engine
 */
function optimizeExamText(rawText) {
    if (!rawText) return { html: "<p style='color:red;'>No text content could be extracted.</p>", anomalies: [] };

    let lines = rawText.split('\n');
    let optimizedLines = [];
    let anomalies = [];
    
    let currentQuestionCounter = 1;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === "") continue;

        let lowerLine = line.toLowerCase();
        
        // 1. Detect placeholders or draft text
        if (lowerLine.includes("lorem ipsum") || lowerLine.includes("todo") || lowerLine.includes("insert here") || lowerLine.includes("draft")) {
            anomalies.push(`Draft text or placeholder words detected: "${line.substring(0, 40)}..."`);
        }

        // 2. Filter out redundant metadata fields typed by teachers (since the template handles them)
        if (
            lowerLine.startsWith("name:") || lowerLine.startsWith("date:") || 
            lowerLine.includes("total marks") || lowerLine.includes("time allowed") ||
            lowerLine.includes("session:") || lowerLine.includes("third term examination") ||
            lowerLine.includes("islamic religious studies") || lowerLine.includes("class:")
        ) {
            continue; // Skip teacher-typed header duplicates
        }

        // 3. Section Headers (Section A, Section B, Theory, etc.)
        if (lowerLine.includes("section a") || lowerLine.includes("section b") || lowerLine.includes("theory question") || lowerLine.includes("objective")) {
            currentQuestionCounter = 1;
            optimizedLines.push(`</div><div class="section-title">${line.toUpperCase()}</div><div class="two-column-zone">`);
            continue;
        }

        // 4. Question Extraction & Numbering Normalization
        let questionMatch = line.match(/^(\d+)[\).\-\s]+(.*)/);
        if (questionMatch) {
            let originalNumber = parseInt(questionMatch[1]);
            let questionContent = questionMatch[2].trim();

            if (originalNumber !== currentQuestionCounter) {
                anomalies.push(`Standardized Question ${originalNumber} to sequence index ${currentQuestionCounter}.`);
            }

            line = `<strong>${currentQuestionCounter}.</strong> ${questionContent}`;
            currentQuestionCounter++;
            optimizedLines.push(`<p class="exam-question">${line}</p>`);
            continue;
        }

        // 5. Clean Multiple Choice Options Formatting (Stacked / Wrapped cleanly to prevent overlapping)
        if (line.match(/^([A-D]|[a-d])[\).\-]/) || line.match(/^\(([A-D]|[a-d])\)/)) {
            optimizedLines.push(`<div class="option-item">${line}</div>`);
        } else {
            if (line.match(/^([a-z])[\).\-\s]/)) {
                optimizedLines.push(`<p class="sub-question-text">${line}</p>`);
            } else {
                optimizedLines.push(`<p class="exam-text">${line}</p>`);
            }
        }
    }

    return {
        html: `<div class="two-column-zone">${optimizedLines.join('\n')}</div>`,
        anomalies: anomalies
    };
}

function generatePrintTemplate(metadata, auditResults) {
    let alertBanner = "";
    if (auditResults.anomalies.length > 0) {
        alertBanner = `
        <div class="officer-alert-box">
            <strong>⚠️ EXAM AUDITOR REPORT FOR EXAM OFFICER:</strong>
            <ul>
                ${auditResults.anomalies.map(err => `<li>${err}</li>`).join('')}
            </ul>
            <small>*Note: This red banner is only for dashboard review. It will hide itself completely when printing.*</small>
        </div>
        `;
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${metadata.subject} Exam Paper</title>
        <style>
            @page { size: A4; margin: 15mm 12mm 15mm 12mm; }
            html, body {
                margin: 0; padding: 0;
                font-family: "Times New Roman", Times, serif;
                background-color: #f1f5f9; color: #000;
                counter-reset: pageNumber;
            }
            .officer-alert-box {
                background-color: #fee2e2; border: 2px solid #ef4444;
                padding: 12px; border-radius: 6px; margin: 15px auto;
                max-width: 210mm; font-family: Arial, sans-serif; font-size: 10pt; color: #991b1b; box-sizing: border-box;
            }
            .officer-alert-box ul { margin: 4px 0; padding-left: 18px; }
            .print-canvas { 
                width: 210mm; min-height: 297mm; margin: 20px auto; 
                background: #fff; padding: 15mm; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                box-sizing: border-box; position: relative;
            }
            /* Official Header Layout */
            .header-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .logo-cell { width: 75px; vertical-align: middle; text-align: left; }
            .logo-img { width: 70px; height: auto; display: block; }
            .title-cell { vertical-align: middle; text-align: center; }
            .school-title { font-size: 16pt; font-weight: bold; margin: 0; white-space: nowrap; letter-spacing: 0.5px; }
            .term-title { font-size: 11pt; font-weight: bold; margin: 3px 0 2px 0; text-transform: uppercase; }
            .subject-title { font-size: 13pt; font-weight: bold; margin: 0; text-transform: uppercase; }
            .boundary-line { border-bottom: 3px solid #000; margin: 6px 0; }
            .meta-row { display: flex; justify-content: space-between; font-size: 10pt; font-weight: bold; margin-bottom: 4px; padding: 2px 0; }
            
            /* Professional Dual-Column Formatting */
            .two-column-zone { column-count: 2; column-gap: 20px; text-align: justify; }
            .section-title { font-size: 10.5pt; font-weight: bold; margin: 14px 0 6px 0; text-decoration: underline; text-transform: uppercase; column-span: all; }
            .exam-question { margin: 6px 0 2px 0; font-size: 9.5pt; line-height: 1.3; page-break-inside: avoid; column-break-inside: avoid; }
            .exam-text { margin: 3px 0; font-size: 9.5pt; line-height: 1.3; page-break-inside: avoid; }
            .sub-question-text { margin: 2px 0 2px 10px; font-size: 9.5pt; line-height: 1.25; page-break-inside: avoid; }
            
            /* Fixed Option styling to prevent overlapping text */
            .option-item { 
                margin: 2px 0 4px 12px; 
                font-size: 9.2pt; 
                line-height: 1.25; 
                page-break-inside: avoid;
                display: inline-block;
                width: 44%;
                margin-right: 2%;
                vertical-align: top;
            }

            .page-footer { position: fixed; bottom: -8mm; left: 0; right: 0; text-align: center; font-size: 9pt; font-weight: bold; }
            .page-footer::after { counter-increment: pageNumber; content: "Page " counter(pageNumber); }

            @media screen and (max-width: 800px) {
                html, body { background-color: #ffffff; padding: 0; margin: 0; }
                .officer-alert-box { max-width: 100%; margin: 10px; padding: 8px; font-size: 9pt; }
                .print-canvas { width: 100% !important; min-height: auto; margin: 0 !important; padding: 10px !important; box-shadow: none !important; }
                .logo-cell { width: 45px; }
                .logo-img { width: 40px; }
                .school-title { font-size: 11pt; white-space: normal; }
                .term-title { font-size: 9pt; }
                .subject-title { font-size: 10pt; }
                .meta-row { font-size: 8pt; flex-direction: column; gap: 2px; }
                .two-column-zone { column-count: 1 !important; }
                .option-item { width: 100% !important; margin-right: 0 !important; }
            }
            @media print {
                html, body { background-color: #fff; background: none; }
                .officer-alert-box { display: none !important; }
                .no-print { display: none !important; }
                .print-canvas { width: 100%; box-shadow: none; margin: 0; padding: 15mm; }
            }
        </style>
    </head>
    <body>
        <!-- Floating Print Action Bar for Exam Officer -->
        <div class="no-print" style="position: fixed; top: 15px; right: 15px; z-index: 9999; display: flex; gap: 8px;">
            <button onclick="window.print()" style="background-color: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: Arial, sans-serif; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 13px;">🖨️ Print / Save PDF</button>
            <button onclick="window.close()" style="background-color: #64748b; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: Arial, sans-serif; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 13px;">✕ Close</button>
        </div>

        ${alertBanner}
        <div class="print-canvas">
            <table class="header-table">
                <tr>
                    <td class="logo-cell"><img src="/logo.png" alt="School Logo" class="logo-img"></td>
                    <td class="title-cell">
                        <div class="school-title">THE NOBLE STANDARD SCHOOLS</div>
                        <div class="term-title">${metadata.term.toUpperCase()} EXAMINATION</div>
                        <div class="subject-title">${metadata.subject.toUpperCase()}</div>
                    </td>
                </tr>
            </table>
            <div class="boundary-line"></div>
            <div class="meta-row">
                <div>CLASS: ${metadata.grade}</div>
                <div>SESSION: ${metadata.session_year}</div>
                <div>TIME ALLOWED: ${metadata.duration}</div>
            </div>
            <div class="boundary-line"></div>
            ${auditResults.html}
            <div class="page-footer"></div>
        </div>
    </body>
    </html>
    `;
}

module.exports = {
    extractTextFromDocx,
    extractTextFromDocxBuffer,
    optimizeExamText,
    generatePrintTemplate,
};