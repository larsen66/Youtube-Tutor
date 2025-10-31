# YouTube Tutor - AI-Powered Learning Extension 🎓

Transform any YouTube video into an interactive learning experience with AI-powered chat, quiz games, and study notes!

## 🌟 Features

### 💬 AI Chat Assistant
- Ask questions about any YouTube video in real-time
- Get contextual answers based on the video transcript
- Streaming responses with beautiful markdown formatting
- Code syntax highlighting support

### 🎓 Study Mode (Interactive Quizzes)
- AI-generated quiz questions from video content
- Multiple choice and text-based questions
- Customizable difficulty (Easy, Medium, Hard)
- Flexible quiz length (3, 5, 8, or 10 questions)
- Real-time scoring and progress tracking
- Instant feedback with detailed explanations
- Beautiful results screen with performance analysis

### 📄 PDF Export
- Generate professional study notes in one click
- AI-powered comprehensive summaries
- 5-7 key takeaways automatically extracted
- Main topics overview
- Optional full transcript inclusion
- Clean, professional PDF formatting

## 🚀 Quick Start

### Prerequisites

**Hardware Requirements:**
- Storage: At least 22 GB free space
- RAM: 16 GB+ (for CPU mode) OR 4+ GB VRAM (for GPU mode)
- OS: Windows 10/11, macOS 13+, Linux, or ChromeOS

**Software Requirements:**
- Chrome 138 or later (Canary/Dev channel recommended)
- Built-in AI model enabled

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

4. **Enable Built-in AI:**
   - Go to `chrome://flags`
   - Search for "Prompt API for Gemini Nano"
   - Enable the flag
   - Restart Chrome

### Development

```bash
npm run dev          # Hot reload development
npm run build        # Production build
npm run webdev       # Preview as web app
```

## 📖 Usage

1. Open any YouTube video
2. Click extension icon to open side panel
3. Click "Initialize AI" button
4. Choose your mode:
   - **Chat:** Ask questions about the video
   - **Study Mode:** Take an AI-generated quiz
   - **Export PDF:** Download study notes

## 🐛 Troubleshooting

### AI Not Available
- Check Chrome version (must be 138+)
- Ensure 22 GB free storage
- Enable flag in chrome://flags
- Visit chrome://on-device-internals to check model status

### JSON Parsing Errors
The extension now has robust JSON extraction that:
- Removes markdown code blocks automatically
- Tries multiple parsing strategies
- Validates data structure
- Provides clear error messages

**If you still see errors:**
- Click "Initialize AI" again
- Try reducing question count (start with 3)
- Check browser console for details

### Transcript Not Loading
- Video must have English captions
- Extension auto-retries (wait ~30 seconds)
- Refresh page and try again

## 🛠️ Technical Details

Built with:
- React 18 + TypeScript
- Tailwind CSS
- Chrome Built-in Prompt API (Gemini Nano)
- jsPDF for PDF generation
- Robust JSON parsing with fallbacks

## 🔒 Privacy

- 100% local processing
- No data sent to servers
- Your questions/answers stay private

## 📄 License

MIT License

## 🙏 Credits

Based on template from [JohnBra](https://github.com/JohnBra/vite-web-extension)# Youtube-Tutor
