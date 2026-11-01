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
 * Advanced Exam Auditor & Clean Extraction Engine
 * Thoroughly strips teacher-typed metadata fragments and redundant header blocks from document body.
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

        // 2. Comprehensive Teacher Metadata & Fragment Filter (Catches stray header parts, classes, marks, time values)
        if (
            lowerLine.includes("the noble standard school") || 
            lowerLine.includes("third term examination") || 
            lowerLine.includes("islamic religious studies") ||
            lowerLine.includes("exam paper") ||
            lowerLine.startsWith("name:") || 
            lowerLine.startsWith("date:") || 
            lowerLine.startsWith("class:") ||
            lowerLine.startsWith("time:") ||
            lowerLine.includes("total marks") || 
            lowerLine.includes("time allowed") ||
            lowerLine.includes("session:") ||
            // Catch stray teacher header fragments broken across lines
            lowerLine === "jss 1" || lowerLine === "jss 2" || lowerLine === "jss 3" ||
            lowerLine === "sss 1" || lowerLine === "sss 2" || lowerLine === "sss 3" ||
            lowerLine.includes("hour") || lowerLine.includes("mins") || 
            lowerLine.includes("marks") || lowerLine === "60" || lowerLine === "40" || 
            lowerLine === "1" || lowerLine === "2" || lowerLine === "3"
        ) {
            anomalies.push(`Filtered out repeated header/metadata fragment: "${line}"`);
            continue; 
        }

        // 3. Section Headers & Instructions (Courier New styling block matching image)
        if (lowerLine.includes("section a") || lowerLine.includes("section b") || lowerLine.includes("theory question") || lowerLine.includes("objective")) {
            currentQuestionCounter = 1;
            optimizedLines.push(`</div><div class="section-banner"><div class="section-accent-bar"></div><div class="section-text-block"><div class="section-title">${line.toUpperCase()}</div>`);
            
            // Look ahead for instruction line if present
            if (i + 1 < lines.length && lines[i + 1].toLowerCase().includes("instruction")) {
                i++;
                optimizedLines.push(`<div class="section-instruction">${lines[i].trim()}</div>`);
            }
            optimizedLines.push(`</div></div><div class="two-column-zone">`);
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
            optimizedLines.push(`<div class="exam-question">${line}</div>`);
            continue;
        }

        // 5. Multiple Choice Options Formatting (11pt Times New Roman, cleanly spaced)
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
            @page { size: A4; margin: 12mm 10mm 12mm 10mm; }
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
                background: #fff; padding: 12mm 15mm; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                box-sizing: border-box; position: relative;
                border: 2px solid #000;
            }
            
            /* Official Header Layout */
            .header-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .logo-cell { width: 75px; vertical-align: middle; text-align: left; }
            .logo-img { width: 65px; height: auto; display: block; }
            .title-cell { vertical-align: middle; text-align: center; }
            
            /* Exact Font Specifications */
            .school-title { font-size: 20pt; font-weight: bold; margin: 0; white-space: nowrap; letter-spacing: 0.5px; }
            .term-title { font-size: 12pt; font-weight: bold; margin: 3px 0 2px 0; text-transform: uppercase; }
            .subject-title { font-size: 12pt; font-weight: bold; margin: 0; text-transform: uppercase; }
            
            .meta-table { width: 100%; font-size: 11pt; font-weight: bold; margin-top: 8px; margin-bottom: 8px; border-collapse: collapse; }
            .meta-table td { padding: 4px 2px; vertical-align: bottom; }
            
            /* Underline Styling for Meta Values (10pt font) */
            .meta-value { 
                font-size: 10pt; 
                font-weight: normal; 
                border-bottom: 1px solid #000; 
                display: inline-block; 
                padding-bottom: 1px;
                min-width: 80px;
            }
            .meta-value-wide { 
                font-size: 10pt; 
                font-weight: normal; 
                border-bottom: 1px solid #000; 
                display: inline-block; 
                padding-bottom: 1px;
                width: 85%;
            }

            /* Section Banner (Courier New 11pt with Vertical Accent Line) */
            .section-banner { 
                display: flex; 
                align-items: center; 
                margin: 15px 0 10px 0; 
                column-span: all; 
                font-family: "Courier New", Courier, monospace;
            }
            .section-accent-bar { width: 5px; height: 32px; background-color: #000; margin-right: 12px; }
            .section-text-block { display: flex; flex-direction: column; }
            .section-title { font-size: 11pt; font-weight: bold; letter-spacing: 0.5px; }
            .section-instruction { font-size: 11pt; font-style: italic; margin-top: 2px; }

            /* Professional Dual-Column Formatting with Vertical Divider Line */
            .two-column-zone { 
                column-count: 2; 
                column-gap: 26px; 
                column-rule: 1px solid #000; 
                text-align: justify; 
            }
            .exam-question { margin: 8px 0 4px 0; font-size: 11pt; line-height: 1.35; page-break-inside: avoid; column-break-inside: avoid; }
            .exam-text { margin: 4px 0; font-size: 11pt; line-height: 1.35; page-break-inside: avoid; }
            .sub-question-text { margin: 3px 0 3px 12px; font-size: 11pt; line-height: 1.3; page-break-inside: avoid; }
            
            .option-item { 
                margin: 3px 0 3px 12px; 
                font-size: 11pt; 
                line-height: 1.3; 
                page-break-inside: avoid;
                display: inline-block;
                margin-right: 15px;
            }

            .page-footer { position: fixed; bottom: -6mm; left: 0; right: 0; text-align: center; font-size: 9pt; font-weight: bold; }
            .page-footer::after { counter-increment: pageNumber; content: "Page " counter(pageNumber); }

            @media screen and (max-width: 800px) {
                html, body { background-color: #ffffff; padding: 0; margin: 0; }
                .officer-alert-box { max-width: 100%; margin: 10px; padding: 8px; font-size: 9pt; }
                .print-canvas { width: 100% !important; min-height: auto; margin: 0 !important; padding: 10px !important; box-shadow: none !important; border: none; }
                .logo-cell { width: 45px; }
                .logo-img { width: 40px; }
                .school-title { font-size: 14pt; white-space: normal; }
                .term-title { font-size: 10pt; }
                .subject-title { font-size: 10pt; }
                .two-column-zone { column-count: 1 !important; column-rule: none !important; }
            }
            @media print {
                html, body { background-color: #fff; background: none; }
                .officer-alert-box { display: none !important; }
                .no-print { display: none !important; }
                .print-canvas { width: 100%; box-shadow: none; margin: 0; padding: 12mm; border: 2px solid #000; }
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
            
            <table class="meta-table">
                <tr>
                    <td>CLASS: <span class="meta-value">${metadata.grade}</span></td>
                    <td>TIME: <span class="meta-value">${metadata.duration}</span></td>
                    <td>TOTAL MARKS: <span class="meta-value">60 Marks</span></td>
                </tr>
                <tr>
                    <td colspan="2">NAME: <span class="meta-value-wide"></span></td>
                    <td>DATE: <span class="meta-value"></span></td>
                </tr>
            </table>
            
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