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
 * Advanced Economy Engine with Multi-Section Auto-Numbering Corrections
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
        
        if (lowerLine.includes("lorem ipsum") || lowerLine.includes("todo") || lowerLine.includes("insert here") || lowerLine.includes("draft")) {
            anomalies.push(`Draft text or filler words detected: "${line.substring(0, 50)}..."`);
        }
        if (line.includes("[") || line.includes("]")) {
            anomalies.push(`Possible placeholder brackets left behind: "${line.substring(0, 50)}..."`);
        }

        if (lowerLine.includes("noble standard") || lowerLine.includes("question paper") || lowerLine.includes("session:") || lowerLine.includes("time allowed:")) {
            continue;
        }

        if (lowerLine.includes("theory question") || lowerLine.includes("section b") || lowerLine.includes("paper ii") || lowerLine.includes("theory parts")) {
            currentQuestionCounter = 1;
            optimizedLines.push(`</div><div class="section-title">${line.toUpperCase()}</div><div class="two-column-zone">`);
            continue;
        }

        let questionMatch = line.match(/^(\d+)[\).\-\s]+(.*)/);
        if (questionMatch) {
            let originalNumber = parseInt(questionMatch[1]);
            let questionContent = questionMatch[2].trim();

            if (originalNumber !== currentQuestionCounter) {
                anomalies.push(`Resolved numbering alignment: Standardized Question ${originalNumber} to Section Index ${currentQuestionCounter}.`);
            }

            line = `${currentQuestionCounter}. ${questionContent}`;
            currentQuestionCounter++;
        }

        if (line.match(/^([A-D]|[a-d])[\).\-]/) || line.match(/^\(([A-D]|[a-d])\)/)) {
            let optionGroup = line;
            while (i + 1 < lines.length && (lines[i + 1].trim().match(/^([A-D]|[a-d])[\).\-]/) || lines[i + 1].trim().match(/^\(([A-D]|[a-d])\)/))) {
                i++;
                optionGroup += ` &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${lines[i].trim()}`;
            }
            optimizedLines.push(`<div class="options-row">${optionGroup}</div>`);
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
            @page { size: A4; margin: 20mm 15mm 20mm 15mm; }
            html, body {
                margin: 0; padding: 0;
                font-family: "Times New Roman", Times, serif;
                background-color: #f1f5f9; color: #000;
                counter-reset: pageNumber;
            }
            .officer-alert-box {
                background-color: #fee2e2; border: 2px solid #ef4444;
                padding: 15px; border-radius: 6px; margin: 20px auto;
                max-width: 210mm; font-family: Arial, sans-serif; font-size: 11pt; color: #991b1b; box-sizing: border-box;
            }
            .officer-alert-box ul { margin: 5px 0; padding-left: 20px; }
            .print-canvas { 
                width: 210mm; min-height: 297mm; margin: 30px auto; 
                background: #fff; padding: 20mm; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                box-sizing: border-box; position: relative;
            }
            .header-table { width: 100%; border-collapse: collapse; padding-top: 5px; }
            .logo-cell { width: 85px; vertical-align: middle; padding-right: 15px; }
            .logo-img { width: 85px; height: auto; display: block; }
            .title-cell { vertical-align: middle; text-align: center; padding-right: 85px; }
            .school-title { font-size: 21pt; font-weight: bold; margin: 0; }
            .term-title { font-size: 12pt; font-weight: bold; margin: 5px 0 2px 0; text-transform: uppercase; }
            .subject-title { font-size: 14pt; font-weight: bold; margin: 0; text-transform: uppercase; }
            .boundary-line { border-bottom: 4px solid #000; margin: 8px 0; }
            .meta-row { display: flex; justify-content: space-between; font-size: 11pt; font-weight: bold; margin-bottom: 6px; padding: 2px 0; }
            .two-column-zone { column-count: 2; column-gap: 30px; text-align: justify; }
            .section-title { font-size: 11.5pt; font-weight: bold; margin: 20px 0 10px 0; text-decoration: underline; text-transform: uppercase; column-span: all; }
            .exam-text { margin: 5px 0; font-size: 10.5pt; line-height: 1.35; page-break-inside: avoid; }
            .sub-question-text { margin: 3px 0 3px 15px; font-size: 10.5pt; line-height: 1.3; page-break-inside: avoid; }
            .options-row { margin: 3px 0 6px 12px; font-size: 10.5pt; white-space: nowrap; page-break-inside: avoid; }
            .page-footer { position: fixed; bottom: -10mm; left: 0; right: 0; text-align: center; font-size: 10pt; font-weight: bold; }
            .page-footer::after { counter-increment: pageNumber; content: "Page " counter(pageNumber); }
            @media screen and (max-width: 800px) {
                html, body { background-color: #ffffff; padding: 0; margin: 0; }
                .officer-alert-box { max-width: 100%; margin: 10px; padding: 10px; font-size: 10pt; }
                .print-canvas { width: 100% !important; min-height: auto; margin: 0 !important; padding: 12px !important; box-shadow: none !important; }
                .logo-cell { width: 50px; padding-right: 8px; }
                .logo-img { width: 50px; }
                .title-cell { padding-right: 50px; }
                .school-title { font-size: 14pt; }
                .term-title { font-size: 10pt; }
                .subject-title { font-size: 11pt; }
                .meta-row { font-size: 9pt; flex-direction: column; gap: 3px; }
                .two-column-zone { column-count: 1 !important; }
            }
            @media print {
                html, body { background-color: #fff; background: none; }
                .officer-alert-box { display: none !important; }
                .print-canvas { width: 100%; box-shadow: none; margin: 0; padding: 20mm; }
            }
        </style>
    </head>
    <body>
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