import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { promptWithStructuredOutput, schemas, validateSummary } from './aiUtils';

interface PDFExportProps {
  session: any;
  videoTitle?: string;
  transcriptLines: Array<{ start: string; dur: string; text: string }>;
  onClose: () => void;
}

interface SummaryData {
  summary: string;
  keyTakeaways: string[];
  topics: string[];
}

export default function PDFExport({ session, videoTitle, transcriptLines, onClose }: PDFExportProps) {
  const [generating, setGenerating] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeTranscript, setIncludeTranscript] = useState(false);

  const generateSummary = async () => {
    if (!session) {
      setError('AI session not ready. Initialize AI first.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const prompt = `Create a comprehensive study guide based on the video transcript.

Provide:
- summary: Write 2-3 detailed paragraphs summarizing the main content and key concepts
- keyTakeaways: List 5-7 specific, actionable key points from the video
- topics: List 3-5 main topics or themes discussed in the video

Base everything on the video transcript content.`;

      // Use responseConstraint for structured JSON output
      const parsed = await promptWithStructuredOutput(session, prompt, schemas.summary);

      // Validate structure
      if (!validateSummary(parsed)) {
        throw new Error('AI response has invalid structure. Please try again.');
      }

      // Clean and validate the data
      const cleanedData: SummaryData = {
        summary: String(parsed.summary).trim(),
        keyTakeaways: parsed.keyTakeaways
          .filter((t: any) => t && String(t).trim())
          .map((t: any) => String(t).trim())
          .slice(0, 7), // Max 7 takeaways
        topics: parsed.topics
          .filter((t: any) => t && String(t).trim())
          .map((t: any) => String(t).trim())
          .slice(0, 5), // Max 5 topics
      };

      if (!cleanedData.summary || cleanedData.keyTakeaways.length === 0 || cleanedData.topics.length === 0) {
        throw new Error('AI did not generate sufficient content. Please try again.');
      }

      setSummaryData(cleanedData);
      setGenerating(false);
    } catch (e: any) {
      console.error('Summary generation error:', e);
      const errorMsg = e?.message || String(e);
      setError(`Failed to generate summary: ${errorMsg}\n\nPlease make sure AI is initialized and try again.`);
      setGenerating(false);
    }
  };

  const exportToPDF = () => {
    if (!summaryData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Helper function to add text with wrapping
    const addText = (text: string, fontSize: number, fontStyle: 'normal' | 'bold' = 'normal', color: [number, number, number] = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', fontStyle);
      doc.setTextColor(color[0], color[1], color[2]);

      const lines = doc.splitTextToSize(text, maxWidth);

      for (const line of lines) {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += fontSize * 0.5;
      }
      yPosition += 5;
    };

    const addSection = (title: string, spacing: number = 10) => {
      yPosition += spacing;
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      addText(title, 14, 'bold', [41, 128, 185]);
      yPosition += 5;
    };

    // Title
    addText('Video Study Notes', 20, 'bold', [31, 78, 121]);
    yPosition += 5;

    // Video title if available
    if (videoTitle) {
      addText(videoTitle, 12, 'normal', [100, 100, 100]);
      yPosition += 5;
    }

    // Date
    addText(`Generated on: ${new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`, 10, 'normal', [150, 150, 150]);

    // Add line
    yPosition += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Summary section
    addSection('Summary');
    addText(summaryData.summary, 11);

    // Key Takeaways section
    addSection('Key Takeaways', 15);
    summaryData.keyTakeaways.forEach((takeaway, idx) => {
      const bullet = `${idx + 1}. `;
      const bulletWidth = doc.getTextWidth(bullet);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);

      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      doc.text(bullet, margin, yPosition);

      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(takeaway, maxWidth - bulletWidth - 5);

      lines.forEach((line: string, lineIdx: number) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        const xPos = lineIdx === 0 ? margin + bulletWidth : margin + bulletWidth;
        doc.text(line, xPos, yPosition);
        yPosition += 11 * 0.5;
      });

      yPosition += 5;
    });

    // Topics Covered section
    addSection('Topics Covered', 15);
    summaryData.topics.forEach((topic) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`• ${topic}`, margin + 5, yPosition);
      yPosition += 11 * 0.5 + 3;
    });

    // Transcript section (optional)
    if (includeTranscript && transcriptLines.length > 0) {
      addSection('Full Transcript', 20);
      const transcriptText = transcriptLines.map(l => l.text).join(' ');
      addText(transcriptText, 9, 'normal', [80, 80, 80]);
    }

    // Footer on last page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      doc.text(
        'Generated by YouTube Tutor Extension',
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }

    // Save the PDF
    const filename = `study-notes-${Date.now()}.pdf`;
    doc.save(filename);
  };

  if (!summaryData) {
    return (
      <div className="container h-screen flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium">Export Notes</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium mb-1">Generate Study Notes</h3>
              <p className="text-sm text-white/60">Create PDF with summary and takeaways</p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-2xl">
              <h4 className="text-xs font-medium mb-3">PDF includes:</h4>
              <ul className="space-y-1.5 text-xs text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Video summary</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Key takeaways</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span>Topics covered</span>
                </li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTranscript}
                  onChange={(e) => setIncludeTranscript(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs text-white/70">
                  Include full transcript
                </span>
              </label>
            </div>

            <button
              onClick={generateSummary}
              disabled={generating}
              className="w-full btn-primary"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container h-screen flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-medium">Preview & Export</h2>
        <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✓</span>
              <h3 className="text-sm font-medium">Study Notes Ready</h3>
            </div>
            <p className="text-xs text-white/60">
              Review the content below and export to PDF when ready.
            </p>
          </div>

          {/* Summary Preview */}
          <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-sm font-medium mb-2">
              Summary
            </h3>
            <p className="text-xs text-white/80 leading-relaxed">{summaryData.summary}</p>
          </div>

          {/* Key Takeaways Preview */}
          <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-sm font-medium mb-3">
              Key Takeaways
            </h3>
            <ul className="space-y-2">
              {summaryData.keyTakeaways.map((takeaway, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-xs font-medium mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-xs text-white/80 pt-0.5">{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Topics Preview */}
          <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            <h3 className="text-sm font-medium mb-3">
              Topics Covered
            </h3>
            <div className="flex flex-wrap gap-2">
              {summaryData.topics.map((topic, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded-xl bg-white/10 text-white/70 text-xs border border-white/20"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="sticky bottom-0 bg-black/80 backdrop-blur p-4 rounded-2xl border border-white/10">
            <div className="flex gap-2">
              <button
                onClick={exportToPDF}
                className="flex-1 btn-primary flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download PDF
              </button>
              <button
                onClick={() => setSummaryData(null)}
                className="btn-secondary"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
