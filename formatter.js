const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

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

async function extractTextFromPdfBuffer(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text;
    } catch (error) {
        console.error("Error reading PDF buffer:", error);
        throw error;
    }
}

function normalizeExamText(rawText) {
    if (!rawText) return '';

    return rawText
        .replace(/\r/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function detectQuestionNumber(line) {
    const match = line.match(/^\s*(\d+)\s*[\).\-\s]+(.*)$/);
    return match ? { number: parseInt(match[1], 10), content: match[2].trim() } : null;
}

function detectOption(line) {
    const match = line.match(/^\s*(?:\()?([A-Da-d])(?:\))?\s*[\).\-\s]+(.*)$/);
    return match ? { letter: match[1].toUpperCase(), text: match[2].trim() } : null;
}

function optimizeExamText(rawText) {
    if (!rawText) {
        return {
            html: "<p style='color:red;'>No text content could be extracted.</p>",
            anomalies: [],
            questionIssues: [],
            optionIssues: [],
            summary: 'No content extracted.',
            hasIssues: false
        };
    }

    const lines = normalizeExamText(rawText).split('\n');
    const optimizedLines = [];
    const anomalies = [];
    const questionIssues = [];
    const optionIssues = [];

    let inSection = false;
    let inTheorySection = false;
    let expectedQuestionNumber = 1;
    let currentQuestionNumber = null;
    let currentQuestionOptions = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        const lowerLine = line.toLowerCase();

        if (lowerLine.includes('lorem ipsum') || lowerLine.includes('todo') || lowerLine.includes('draft')) {
            anomalies.push(`Draft text detected: "${line.substring(0, 30)}..."`);
        }

        if (lowerLine.includes('section a') || lowerLine.includes('section b') || lowerLine.includes('theory question') || lowerLine.includes('objective')) {
            inSection = true;
            inTheorySection = lowerLine.includes('section b') || lowerLine.includes('theory');
            expectedQuestionNumber = 1;
            currentQuestionNumber = null;
            currentQuestionOptions = [];

            optimizedLines.push(`</div><div class="section-banner"><div class="section-accent-bar"></div><div class="section-text-block"><div class="section-title">${line.toUpperCase()}</div>`);

            if (i + 1 < lines.length && (lines[i + 1].toLowerCase().includes('instruction') || lines[i + 1].toLowerCase().includes('answer'))) {
                i++;
                const instText = lines[i].trim().replace(/\b(instructions?)\b/gi, '<strong>$1</strong>');
                optimizedLines.push(`<div class="section-instruction">${instText}</div>`);
            }
            optimizedLines.push(`</div></div><div class="two-column-zone">`);
            continue;
        }

        if (!inSection) {
            if (
                lowerLine.includes('the noble standard school') ||
                lowerLine.includes('third term examination') ||
                lowerLine.includes('islamic religious studies') ||
                lowerLine.includes('exam paper') ||
                lowerLine.startsWith('name:') ||
                lowerLine.startsWith('date:') ||
                lowerLine.startsWith('class:') ||
                lowerLine.startsWith('time:') ||
                lowerLine.includes('total marks') ||
                lowerLine.includes('time allowed') ||
                lowerLine.includes('session:') ||
                lowerLine.match(/^(jss|sss)\s*[1-3]/i) ||
                lowerLine.includes('hour') ||
                lowerLine.includes('mins') ||
                lowerLine.includes('marks') ||
                /^\d+$/.test(lowerLine)
            ) {
                continue;
            }
        }

        const question = detectQuestionNumber(line);
        if (question) {
            const { number, content } = question;
            if (number !== expectedQuestionNumber) {
                const msg = `Question numbering mismatch: found ${number}, expected ${expectedQuestionNumber}.`;
                anomalies.push(msg);
                questionIssues.push({
                    type: 'question-number',
                    questionNumber: number,
                    expected: expectedQuestionNumber,
                    line: i + 1,
                    message: msg
                });
            }

            currentQuestionNumber = number || expectedQuestionNumber;
            expectedQuestionNumber = number ? number + 1 : expectedQuestionNumber + 1;
            currentQuestionOptions = [];

            optimizedLines.push(`<div class="exam-question"><strong>${currentQuestionNumber}.</strong> ${content}</div>`);
            continue;
        }

        const option = detectOption(line);
        if (option) {
            const expectedLetter = ['A', 'B', 'C', 'D'][currentQuestionOptions.length] || null;

            if (expectedLetter && option.letter !== expectedLetter) {
                const msg = `Option letter mismatch: found ${option.letter}, expected ${expectedLetter} for the current question.`;
                anomalies.push(msg);
                optionIssues.push({
                    type: 'option-letter',
                    questionNumber: currentQuestionNumber,
                    found: option.letter,
                    expected: expectedLetter,
                    line: i + 1,
                    message: msg
                });
            }

            if (currentQuestionOptions.includes(option.letter)) {
                const msg = `Repeated option letter detected: ${option.letter} appears more than once in the same question.`;
                anomalies.push(msg);
                optionIssues.push({
                    type: 'repeated-option',
                    questionNumber: currentQuestionNumber,
                    letter: option.letter,
                    line: i + 1,
                    message: msg
                });
            }

            currentQuestionOptions.push(option.letter);
            optimizedLines.push(`<div class="option-item"><strong>${option.letter}.</strong> ${option.text}</div>`);
            continue;
        }

        if (inTheorySection && (lowerLine.startsWith('question') || line.match(/^[a-z]\)/i))) {
            optimizedLines.push(`<div class="exam-question">${line}</div>`);
            continue;
        }

        const processedLine = line.replace(/\b(instructions?)\b/gi, '<strong>$1</strong>');
        if (line.match(/^([A-D]|[a-d])[\).\-]/) || line.match(/^\(([A-D]|[a-d])\)/)) {
            optimizedLines.push(`<div class="option-item">${processedLine}</div>`);
        } else if (line.match(/^([a-z])[\).\-\s]/)) {
            optimizedLines.push(`<p class="sub-question-text">${processedLine}</p>`);
        } else {
            optimizedLines.push(`<p class="exam-text">${processedLine}</p>`);
        }
    }

    const summary = anomalies.length > 0
        ? `Found ${questionIssues.length} question-number issue(s) and ${optionIssues.length} option issue(s).`
        : 'No numbering or option errors detected.';

    return {
        html: `<div class="two-column-zone">${optimizedLines.join('\n')}</div>`,
        anomalies,
        questionIssues,
        optionIssues,
        summary,
        hasIssues: anomalies.length > 0
    };
}

function generatePrintTemplate(metadata, auditResults) {
    const alertBanner = auditResults.hasIssues ? `
        <div class="officer-alert-box no-print">
            <strong>⚠️ EXAM AUDITOR REPORT FOR EXAM OFFICER:</strong>
            <div style="margin-top: 8px; font-size: 10pt; color: #7f1d1d; font-weight: 600;">${auditResults.summary}</div>
            <ul>
                ${auditResults.anomalies.map((err) => `<li>${err}</li>`).join('')}
            </ul>
            <small>*Note: This banner is for dashboard review only and hides during print.*</small>
        </div>
    ` : '';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${metadata.subject} Exam Paper</title>
        <style>
            @page {
                size: A4 portrait;
                margin: 10mm;
            }

            html, body {
                margin: 0;
                padding: 0;
                background: #fff;
                color: #111;
                font-family: "Times New Roman", Georgia, serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .officer-alert-box {
                background-color: #fee2e2;
                border: 2px solid #ef4444;
                padding: 12px;
                border-radius: 6px;
                margin: 15px auto;
                max-width: 210mm;
                font-family: Arial, sans-serif;
                font-size: 10pt;
                color: #991b1b;
                box-sizing: border-box;
            }
            .officer-alert-box ul {
                margin: 6px 0 0 18px;
                padding: 0;
            }

            .exam-sheet {
                width: 100%;
                max-width: 210mm;
                margin: 0 auto;
                background: white;
                padding: 10mm;
                box-sizing: border-box;
                position: relative;
            }

            /* Institutional Watermark */
            .exam-sheet::before {
                content: "THE NOBLE STANDARD SCHOOLS";
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%) rotate(-30deg);
                font-size: 32pt;
                font-weight: bold;
                letter-spacing: 2px;
                color: rgba(0,0,0,0.03);
                white-space: nowrap;
                pointer-events: none;
                z-index: 0;
            }

            .exam-sheet > * {
                position: relative;
                z-index: 1;
            }

            .header-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
            }
            .logo-cell {
                width: 72px;
                text-align: left;
                vertical-align: middle;
            }
            .logo-img {
                width: 52px;
                height: auto;
                display: block;
            }
            .title-cell {
                text-align: center;
                vertical-align: middle;
            }
            .school-title {
                font-size: 20pt;
                font-weight: bold;
                letter-spacing: 0.5px;
                margin: 0;
                text-transform: uppercase;
            }
            .term-title {
                font-size: 11pt;
                font-weight: bold;
                margin-top: 4px;
                text-transform: uppercase;
            }
            .subject-title {
                font-size: 11pt;
                font-weight: bold;
                margin-top: 2px;
                text-transform: uppercase;
            }

            .meta-table {
                width: 100%;
                font-size: 10pt;
                font-weight: bold;
                border-collapse: collapse;
                margin-top: 10px;
                margin-bottom: 10px;
                border-bottom: 2px solid #000;
                padding-bottom: 5px;
            }
            .meta-table td {
                padding: 4px 2px;
                vertical-align: bottom;
            }
            .meta-value {
                display: inline-block;
                min-width: 80px;
                border-bottom: 1px solid #000;
                font-weight: normal;
                padding-bottom: 1px;
            }
            .meta-value-wide {
                display: inline-block;
                width: 80%;
                border-bottom: 1px solid #000;
                font-weight: normal;
                padding-bottom: 1px;
            }

            .section-banner {
                display: flex;
                align-items: center;
                margin: 14px 0 8px 0;
                column-span: all;
                break-inside: avoid;
            }
            .section-accent-bar {
                width: 4px;
                height: 26px;
                background: #000;
                margin-right: 10px;
            }
            .section-text-block {
                display: flex;
                flex-direction: column;
            }
            .section-title {
                font-size: 11pt;
                font-weight: bold;
                letter-spacing: 0.4px;
                text-transform: uppercase;
            }
            .section-instruction {
                font-size: 10pt;
                font-style: italic;
                margin-top: 2px;
            }

            .two-column-zone {
                column-count: 2;
                column-gap: 20px;
                column-rule: 1px solid #000;
                text-align: justify;
            }

            .exam-question {
                margin: 8px 0 4px 0;
                font-size: 10.5pt;
                line-height: 1.35;
                break-inside: avoid;
                page-break-inside: avoid;
                overflow-wrap: anywhere;
            }
            .exam-text {
                margin: 4px 0;
                font-size: 10.5pt;
                line-height: 1.35;
                break-inside: avoid;
                page-break-inside: avoid;
                overflow-wrap: anywhere;
            }
            .sub-question-text {
                margin: 3px 0 3px 12px;
                font-size: 10.5pt;
                line-height: 1.3;
                break-inside: avoid;
                page-break-inside: avoid;
                overflow-wrap: anywhere;
            }
            .option-item {
                margin: 3px 0 3px 12px;
                font-size: 10.5pt;
                line-height: 1.3;
                display: inline-block;
                margin-right: 12px;
                break-inside: avoid;
                page-break-inside: avoid;
            }

            .page-footer {
                text-align: center;
                font-size: 9pt;
                font-weight: bold;
                margin-top: 20px;
                border-top: 1px solid #ccc;
                padding-top: 5px;
            }

            @media print {
                .no-print { display: none !important; }
                body { background: #fff !important; }
                .exam-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
            }
        </style>
    </head>
    <body>
        <div class="no-print" style="position: fixed; top: 15px; right: 15px; z-index: 9999; display: flex; gap: 8px; background: rgba(255,255,255,0.9); padding: 8px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <button onclick="window.print()" style="background-color: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: Arial, sans-serif;">🖨️ Print Document</button>
            <button onclick="window.close()" style="background-color: #64748b; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-family: Arial, sans-serif;">✕ Close</button>
        </div>

        ${alertBanner}

        <div class="exam-sheet">
            <table class="header-table">
                <tr>
                    <td class="logo-cell"><img src="/logo.png" alt="School Logo" class="logo-img"></td>
                    <td class="title-cell">
                        <div class="school-title">The Noble Standard Schools</div>
                        <div class="term-title">Third Term Examination</div>
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

            <div class="page-footer">TNSS - (${metadata.grade} ${metadata.subject})</div>
        </div>

        <script>
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    window.print();
                }, 500);
            });
        </script>
    </body>
    </html>
    `;
}

module.exports = {
    extractTextFromDocx,
    extractTextFromDocxBuffer,
    extractTextFromPdfBuffer,
    optimizeExamText,
    generatePrintTemplate,
};
