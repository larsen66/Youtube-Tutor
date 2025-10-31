import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { promptWithStructuredOutput, schemas, validateQuizQuestions } from './aiUtils';
import Lottie from 'lottie-react';
import studentAnimation from '/public/STUDENT.json';

export interface Question {
  id: number;
  question: string;
  type: 'multiple_choice' | 'text';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

interface StudyModeProps {
  session: any;
  onClose: () => void;
  isStreaming: boolean;
  setIsStreaming: (val: boolean) => void;
}

export default function StudyMode({ session, onClose, isStreaming, setIsStreaming }: StudyModeProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [textAnswer, setTextAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  const [score, setScore] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionCount, setQuestionCount] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [evaluatingAnswer, setEvaluatingAnswer] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const currentQuestion = questions[currentQuestionIndex];

  const generateQuestions = async () => {
    if (!session) {
      setError('AI session not ready. Initialize AI first.');
      return;
    }

    setGenerating(true);
    setError(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setQuizComplete(false);

    try {
      const prompt = `Generate ${questionCount} quiz questions about the video transcript at ${difficulty} difficulty.

Mix both multiple_choice questions (with 4 options each) and text questions (open-ended).

For multiple_choice questions:
- Include exactly 4 options
- Make sure correctAnswer matches one of the options exactly

For text questions:
- Provide the expected answer in correctAnswer

Always include explanations for each question.`;

      // Use responseConstraint for structured JSON output
      const parsed = await promptWithStructuredOutput(session, prompt, schemas.quizQuestions);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI did not generate any questions. Please try again.');
      }

      // Clean and validate questions
      const validQuestions = parsed
        .filter((q: any) => {
          if (!q.question || !q.type || !q.correctAnswer) return false;
          if (q.type === 'multiple_choice' && (!Array.isArray(q.options) || q.options.length < 2)) return false;
          return true;
        })
        .map((q: any, idx: number) => ({
          id: idx + 1,
          question: String(q.question).trim(),
          type: q.type === 'text' ? 'text' : 'multiple_choice',
          options: q.type === 'multiple_choice' && Array.isArray(q.options)
            ? q.options.slice(0, 4).map((o: any) => String(o).trim())
            : undefined,
          correctAnswer: String(q.correctAnswer).trim(),
          explanation: q.explanation ? String(q.explanation).trim() : 'No explanation provided.',
        }));

      if (validQuestions.length === 0) {
        throw new Error('No valid questions were generated. Please try again.');
      }

      setQuestions(validQuestions);
      setGenerating(false);
    } catch (e: any) {
      console.error('Quiz generation error:', e);
      const errorMsg = e?.message || String(e);
      setError(`Failed to generate questions: ${errorMsg}\n\nPlease make sure AI is initialized and try again.`);
      setGenerating(false);
    }
  };

  const handleAnswerSubmit = async () => {
    if (!currentQuestion) return;

    const userAns = currentQuestion.type === 'multiple_choice' ? selectedAnswer : textAnswer;
    if (!userAns.trim()) return;

    // Update question with user answer
    const updatedQuestions = [...questions];

    // Normalize both answers: lowercase, trim, remove punctuation
    const normalizeAnswer = (str: string) => {
      return str.toLowerCase().trim().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
    };

    let isCorrect = false;
    let aiFeedback = currentQuestion.explanation || '';

    if (currentQuestion.type === 'multiple_choice') {
      // For multiple choice, use string matching
      const correctAns = normalizeAnswer(currentQuestion.correctAnswer);
      const userAnsNormalized = normalizeAnswer(userAns);

      isCorrect = userAnsNormalized === correctAns ||
                  userAnsNormalized.includes(correctAns) ||
                  correctAns.includes(userAnsNormalized);
    } else {
      // For text answers, use AI to evaluate semantic correctness
      setEvaluatingAnswer(true);

      try {
        const evaluationPrompt = `Evaluate if the user's answer is semantically correct for this question.

Question: "${currentQuestion.question}"
Expected Answer: "${currentQuestion.correctAnswer}"
User's Answer: "${userAns}"

Determine if the user's answer conveys the same meaning as the expected answer, even if worded differently.
Consider the answer correct if:
- It contains the key concepts from the expected answer
- It's semantically equivalent even with different wording
- It demonstrates understanding of the topic

Provide:
- isCorrect: true if semantically correct, false otherwise
- feedback: Brief explanation of why it's correct or incorrect`;

        const evaluation = await promptWithStructuredOutput(session, evaluationPrompt, schemas.answerEvaluation);

        isCorrect = evaluation.isCorrect;
        aiFeedback = evaluation.feedback || currentQuestion.explanation || '';
      } catch (e: any) {
        console.error('Answer evaluation error:', e);
        // Fallback to string matching if AI evaluation fails
        const correctAns = normalizeAnswer(currentQuestion.correctAnswer);
        const userAnsNormalized = normalizeAnswer(userAns);
        isCorrect = userAnsNormalized.includes(correctAns) || correctAns.includes(userAnsNormalized);
      } finally {
        setEvaluatingAnswer(false);
      }
    }

    updatedQuestions[currentQuestionIndex] = {
      ...currentQuestion,
      userAnswer: userAns,
      isCorrect,
      explanation: aiFeedback, // Update with AI feedback for text answers
    };

    setQuestions(updatedQuestions);
    setShowResult(true);

    if (isCorrect) {
      setScore(score + 1);
    }
  };

  const handleNext = () => {
    setShowResult(false);
    setSelectedAnswer('');
    setTextAnswer('');

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setQuizComplete(true);
    }
  };

  const handleRetry = () => {
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setQuizComplete(false);
    setShowResult(false);
    setSelectedAnswer('');
    setTextAnswer('');
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [showResult, quizComplete]);

  if (quizComplete) {
    const percentage = Math.round((score / questions.length) * 100);

    return (
      <div className="container h-screen flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium">Quiz Complete</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
              <div className="text-5xl font-bold mb-2">{percentage}%</div>
              <div className="text-sm text-white/60">You got {score} out of {questions.length} correct</div>
            </div>

            <div className="space-y-2 mb-6">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3 bg-white/5 border border-white/10 rounded-2xl"
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-sm ${q.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                      {q.isCorrect ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/50 mb-1">Question {idx + 1}</div>
                      <div className="text-sm mb-2">{q.question}</div>
                      <div className="text-xs text-white/60 space-y-1">
                        <div>Your answer: <span className={q.isCorrect ? 'text-green-500' : 'text-red-500'}>{q.userAnswer}</span></div>
                        {!q.isCorrect && <div>Correct: <span className="text-green-500">{q.correctAnswer}</span></div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={handleRetry} className="flex-1 btn-primary">
                New Quiz
              </button>
              <button onClick={onClose} className="flex-1 btn-secondary">
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="container h-screen flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-medium">Study Mode</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div className="w-48 h-48">
                  <Lottie animationData={studentAnimation} loop={true} />
                </div>
              </div>
              <h3 className="text-lg font-medium mb-1">Test Your Knowledge</h3>
              <p className="text-sm text-white/60">Generate quiz from video content</p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium mb-2">Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`px-3 py-2 text-xs font-medium capitalize rounded-xl transition-colors ${
                        difficulty === level
                          ? 'bg-white text-black'
                          : 'bg-white/5 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">Questions</label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 5, 8, 10].map((count) => (
                    <button
                      key={count}
                      onClick={() => setQuestionCount(count)}
                      className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                        questionCount === count
                          ? 'bg-white text-black'
                          : 'bg-white/5 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={generateQuestions}
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
                'Start Quiz'
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
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">{currentQuestionIndex + 1} / {questions.length}</h2>
          <div className="text-xs text-white/50">
            Score: {score}/{questions.length}
          </div>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* Progress bar - Minimal */}
      <div className="h-0.5 bg-white/10">
        <div
          className="h-full bg-white/30 transition-all duration-300"
          style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="text-xs text-white/50 mb-3">
              {currentQuestion.type === 'multiple_choice' ? 'Multiple Choice' : 'Text Answer'}
            </div>
            <h3 className="text-lg font-medium mb-6">{currentQuestion.question}</h3>

            {currentQuestion.type === 'multiple_choice' ? (
              <div className="space-y-2">
                {currentQuestion.options?.map((option, idx) => {
                  // Normalize for comparison
                  const normalizeAnswer = (str: string) => {
                    return str.toLowerCase().trim().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
                  };

                  const isCorrectOption = showResult && (
                    normalizeAnswer(option) === normalizeAnswer(currentQuestion.correctAnswer) ||
                    normalizeAnswer(option).includes(normalizeAnswer(currentQuestion.correctAnswer)) ||
                    normalizeAnswer(currentQuestion.correctAnswer).includes(normalizeAnswer(option))
                  );
                  const isSelectedOption = option === selectedAnswer;

                  return (
                    <button
                      key={idx}
                      onClick={() => !showResult && setSelectedAnswer(option)}
                      disabled={showResult}
                      className={`w-full text-left p-3 rounded-2xl border text-sm transition-all ${
                        showResult
                          ? isCorrectOption
                            ? 'border-green-500 bg-green-500/10 text-green-400'
                            : isSelectedOption
                            ? 'border-red-500 bg-red-500/10 text-red-400'
                            : 'border-white/10 bg-white/5 text-white/40'
                          : isSelectedOption
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      } ${showResult ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          showResult && isCorrectOption
                            ? 'border-green-500 bg-green-500'
                            : showResult && isSelectedOption
                            ? 'border-red-500 bg-red-500'
                            : isSelectedOption
                            ? 'border-white/30 bg-white/30'
                            : 'border-white/20'
                        }`}>
                          {showResult && isCorrectOption && (
                            <span className="text-white text-xs">✓</span>
                          )}
                          {showResult && isSelectedOption && !isCorrectOption && (
                            <span className="text-white text-xs">✗</span>
                          )}
                          {!showResult && isSelectedOption && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <span className="flex-1">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={showResult || evaluatingAnswer}
                  placeholder="Type your answer here..."
                  className="w-full h-24 rounded-2xl p-3 text-sm resize-none disabled:opacity-50"
                />
                <div className="mt-2 text-xs text-white/50">
                  AI evaluates semantically - use your own words
                </div>
              </div>
            )}
          </div>

          {evaluatingAnswer && (
            <div className="p-3 bg-white/5 border border-white/20 rounded-2xl animate-fadeIn">
              <div className="flex items-center gap-2 text-sm">
                <svg className="animate-spin h-4 w-4 text-white/50" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-white/70">Evaluating answer...</span>
              </div>
            </div>
          )}

          {showResult && (
            <div className={`p-4 bg-white/5 border rounded-2xl animate-slideUp ${currentQuestion.isCorrect ? 'border-green-500' : 'border-red-500'}`}>
              <div className="flex items-start gap-3">
                <span className={`text-lg ${currentQuestion.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                  {currentQuestion.isCorrect ? '✓' : '✗'}
                </span>
                <div className="flex-1 text-sm">
                  <div className="font-medium mb-1">
                    {currentQuestion.isCorrect ? 'Correct' : 'Incorrect'}
                  </div>
                  {currentQuestion.explanation && (
                    <div className="text-white/80 mb-2">
                      <ReactMarkdown>{currentQuestion.explanation}</ReactMarkdown>
                    </div>
                  )}
                  {!currentQuestion.isCorrect && (
                    <div className="text-white/60">
                      Correct answer: <span className="font-medium text-green-500">{currentQuestion.correctAnswer}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-6">
            {!showResult ? (
              <button
                onClick={handleAnswerSubmit}
                disabled={evaluatingAnswer || (currentQuestion.type === 'multiple_choice' ? !selectedAnswer : !textAnswer.trim())}
                className="flex-1 btn-primary"
              >
                {evaluatingAnswer ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Evaluating...
                  </span>
                ) : (
                  'Submit'
                )}
              </button>
            ) : (
              <button onClick={handleNext} className="flex-1 btn-primary">
                {currentQuestionIndex < questions.length - 1 ? 'Next' : 'Finish'}
              </button>
            )}
          </div>

          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
