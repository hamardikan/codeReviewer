# Code Reviewer

A modern web application that helps you review and analyze code using AI-powered insights. Easily submit code in multiple programming languages and get professional feedback and suggestions.

## Features

- **Code Submission**: Upload or paste code snippets for review
- **Multi-language Support**: Support for JavaScript, Python, Java, C++ and more
- **AI-Powered Analysis**: Leverage Google's Generative AI for intelligent code reviews
- **Syntax Highlighting**: Clear code visualization with VS Code-like editor experience
- **Dark/Light Mode**: Comfortable viewing experience in any environment
- **Review History**: Track and revisit previous code reviews

## Technologies Used

- **Frontend**: React 19, Next.js 15
- **Code Editor**: CodeMirror with language-specific extensions
- **Styling**: TailwindCSS with form plugins
- **AI Integration**: Google Generative AI
- **Database**: MongoDB
- **Theme Management**: next-themes
- **Build Tools**: TypeScript, ESLint, PostCSS

## Getting Started

### Prerequisites

- Node.js 18.17.0 or higher
- npm or yarn or pnpm or bun

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/hamardikan/codeReviewer.git
   cd code-reviewer
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory with:
   ```
   GOOGLE_API_KEY=your_google_ai_api_key
   MONGODB_URI=your_mongodb_connection_string
   ```

4. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. Access the main interface at `http://localhost:3000`
2. Paste or upload your code in the editor
3. Select the appropriate language
4. Click "Review" to get AI-powered feedback
5. View the analysis results and recommendations
6. Save your review or make adjustments based on suggestions

## Project Structure

```
code-reviewer/
├── public/            # Static files
├── src/
│   ├── app/           # Next.js app router pages
│   │   ├── api/       # API routes
│   │   │   └── review # Review API endpoints
│   │   ├── reviews/   # Reviews interface
│   │   └── page.tsx   # Home page
│   ├── components/    # Reusable React components
│   ├── lib/           # Utility functions and shared code
│   └── styles/        # Global styles
├── .eslintrc.js       # ESLint configuration
├── next.config.ts     # Next.js configuration
├── package.json       # Dependencies and scripts
├── postcss.config.mjs # PostCSS configuration
├── tailwind.config.js # Tailwind configuration
└── tsconfig.json      # TypeScript configuration
```

## API Reference

### POST `/api/review`

Submit code for review.

**Request Body:**
```json
{
  "code": "function example() { return 'hello world'; }",
  "language": "javascript"
}
```

**Response:**
```json
{
  "id": "review123",
  "review": "Detailed review of the code...",
  "suggestions": [
    "Consider adding documentation",
    "Handle potential edge cases"
  ]
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.