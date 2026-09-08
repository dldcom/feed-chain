import { useEffect, useMemo, useState } from "react";
import {
  MODE4_QUIZ_QUESTIONS,
  MODE4_REFLECTION_MIN_LENGTH,
  MODE4_REFLECTION_PROMPT,
  type QuizProgress,
  type QuizReveal,
  type ReflectionProgressEntry,
  type ReflectionProgress,
} from "@feed-chain/shared";
import { PixelSpeciesIcon } from "../components/PixelSpeciesIcon";
import { downloadClassResult, leaveClass, sendQuizAnswer, sendReflection, sendTeacherCommand } from "../network/gameClient";
import { useGameStore } from "../store/gameStore";

function ReviewHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }): JSX.Element {
  return (
    <header className="review-topbar">
      <span className="review-mark">4</span>
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
      </div>
      {detail && <strong>{detail}</strong>}
    </header>
  );
}

function QuizProgressDots({ index }: { index: number }): JSX.Element {
  return (
    <div className="quiz-progress-dots" aria-label={`총 ${MODE4_QUIZ_QUESTIONS.length}문제 중 ${index + 1}번째`}>
      {MODE4_QUIZ_QUESTIONS.map((question, questionIndex) => <i key={question.id} className={questionIndex === index ? "active" : questionIndex < index ? "done" : ""} />)}
    </div>
  );
}

function normalizeQuizAnswer(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase();
}

function StudentQuiz({ questionIndex, revealed, reveal }: { questionIndex: number; revealed: boolean; reveal: QuizReveal | null }): JSX.Element {
  const question = MODE4_QUIZ_QUESTIONS[questionIndex] ?? MODE4_QUIZ_QUESTIONS[0]!;
  const savedAnswer = useGameStore((state) => state.quizAnswer);
  const [choice, setChoice] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [textSubmitted, setTextSubmitted] = useState(false);

  useEffect(() => {
    setChoice(null);
    setTextAnswer("");
    setTextSubmitted(false);
  }, [questionIndex]);

  useEffect(() => {
    if (savedAnswer?.questionIndex !== questionIndex || savedAnswer.optionIndex < 0) return;
    if (question.kind === "text" && savedAnswer.answer !== undefined) {
      setTextAnswer(savedAnswer.answer);
      setTextSubmitted(true);
    } else if (question.kind === "choice") {
      setChoice(savedAnswer.optionIndex);
    }
  }, [question, questionIndex, savedAnswer?.answer, savedAnswer?.optionIndex, savedAnswer?.questionIndex]);

  const submit = (optionIndex: number) => {
    if (revealed || choice !== null) return;
    setChoice(optionIndex);
    sendQuizAnswer(question.id, optionIndex);
  };
  const submitText = (): void => {
    if (revealed || textSubmitted) return;
    const answer = textAnswer.trim();
    if (!answer) return;
    setTextAnswer(answer);
    setTextSubmitted(true);
    sendQuizAnswer(question.id, answer);
  };
  const answered = question.kind === "text" ? textSubmitted : choice !== null;
  const hasReveal = revealed && reveal?.questionIndex === questionIndex;
  const correct = hasReveal && (question.kind === "text"
    ? normalizeQuizAnswer(textAnswer) === normalizeQuizAnswer(reveal?.correctAnswer ?? question.correctAnswer ?? "")
    : choice === reveal?.correctOption);

  return (
    <main className="mode4-review-screen student-review-screen">
      <ReviewHeader eyebrow="4번 게임 · 함께 생각해 보기" title="생태계 탐험 퀴즈" detail={`${questionIndex + 1} / ${MODE4_QUIZ_QUESTIONS.length}`} />
      <section className="quiz-board" aria-live="polite">
        <QuizProgressDots index={questionIndex} />
        <div className="quiz-question-number">QUESTION {String(questionIndex + 1).padStart(2, "0")}</div>
        <h2>{question.prompt}</h2>
        {question.kind === "text" ? (
          <div className="quiz-text-answer">
            <input
              type="text"
              value={textAnswer}
              maxLength={80}
              placeholder="정답을 입력하세요"
              disabled={answered || hasReveal}
              onChange={(event) => setTextAnswer(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitText(); }}
              aria-label="주관식 답변"
            />
            <button type="button" disabled={!textAnswer.trim() || answered || hasReveal} onClick={submitText}>제출</button>
          </div>
        ) : (
          <div className="quiz-options">
            {question.options.map((option, optionIndex) => {
              const selected = choice === optionIndex;
              const isCorrect = hasReveal && reveal?.correctOption === optionIndex;
              const isWrong = hasReveal && selected && !isCorrect;
              return (
                <button
                  key={option}
                  type="button"
                  className={`quiz-option ${selected ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                  disabled={answered || hasReveal}
                  onClick={() => submit(optionIndex)}
                >
                  <b>{String.fromCharCode(65 + optionIndex)}</b>
                  <span>{option}</span>
                  {isCorrect && <em>정답</em>}
                </button>
              );
            })}
          </div>
        )}
        <div className={`quiz-feedback ${hasReveal ? (correct ? "is-correct" : "is-wrong") : ""}`}>
          {!answered && "답을 하나 골라 보세요."}
          {answered && !hasReveal && "답을 골랐어요. 선생님이 함께 확인할 거예요."}
          {hasReveal && (correct ? "맞았어요!" : "다시 생각해 볼 수 있어요.")}
          {hasReveal && reveal?.explanation && <p>{reveal.explanation}</p>}
        </div>
      </section>
    </main>
  );
}

function QuizTeacherBoard({ questionIndex, revealed, progress }: { questionIndex: number; revealed: boolean; progress: QuizProgress | null }): JSX.Element {
  const question = MODE4_QUIZ_QUESTIONS[questionIndex] ?? MODE4_QUIZ_QUESTIONS[0]!;
  const answers = progress?.answers ?? [];
  const submittedAnswers = answers.filter((answer) => answer.optionIndex !== null);
  const textAnswers = submittedAnswers.filter((answer) => Boolean(answer.answer?.trim()));
  const counts = useMemo(() => question.options.map((_, optionIndex) => answers.filter((answer) => answer.optionIndex === optionIndex).length), [answers, question]);
  return (
    <section className="quiz-teacher-board">
      <div className="quiz-teacher-question">
        <span>QUESTION {String(questionIndex + 1).padStart(2, "0")}</span>
        <h2>{question.prompt}</h2>
        <small>{revealed ? question.explanation : "학생들이 답을 고르면 여기에서 확인할 수 있어요."}</small>
      </div>
      <div className={`quiz-answer-grid ${question.kind === "text" ? "quiz-text-answer-grid" : ""}`}>
        {question.kind === "text" ? (
          <>
            <div className="quiz-text-answer-heading"><span>학생 답변</span><strong>{textAnswers.length}명</strong></div>
            <div className="quiz-text-answer-list">
              {textAnswers.map((answer) => <div key={answer.playerId}><span>{answer.playerName}</span><strong>{answer.answer}</strong></div>)}
              {!textAnswers.length && <small>아직 제출한 답변이 없어요.</small>}
            </div>
            {revealed && question.correctAnswer && <div className="quiz-text-correct-answer"><small>정답</small><strong>{question.correctAnswer}</strong></div>}
          </>
        ) : question.options.map((option, optionIndex) => (
          <div key={option} className={`quiz-answer-row ${revealed && optionIndex === question.correctOption ? "answer-key" : ""}`}>
            <b>{String.fromCharCode(65 + optionIndex)}</b>
            <span>{option}</span>
            <strong>{counts[optionIndex] ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="quiz-student-status">
        <span>제출한 탐험대</span>
        <strong>{progress?.submittedCount ?? 0}명</strong>
        <small>/ {progress?.total ?? 0}명</small>
      </div>
      {question.kind === "choice" && <div className="quiz-answer-names">
        {submittedAnswers.map((answer) => <span key={answer.playerId}>{answer.playerName} · {String.fromCharCode(65 + (answer.optionIndex ?? 0))}</span>)}
        {!submittedAnswers.length && <small>아직 답을 고른 탐험대가 없어요.</small>}
      </div>}
    </section>
  );
}

function TeacherQuiz({ questionIndex, revealed, progress }: { questionIndex: number; revealed: boolean; progress: QuizProgress | null }): JSX.Element {
  const isLast = questionIndex >= MODE4_QUIZ_QUESTIONS.length - 1;
  return (
    <main className="mode4-review-screen teacher-review-screen">
      <ReviewHeader eyebrow="교사 진행 화면 · 학생에게는 보이지 않아요" title="생태계 탐험 퀴즈" detail={`${questionIndex + 1} / ${MODE4_QUIZ_QUESTIONS.length}`} />
      <QuizTeacherBoard questionIndex={questionIndex} revealed={revealed} progress={progress} />
      <div className="review-teacher-actions">
        <button type="button" className="review-primary-action" disabled={revealed} onClick={() => sendTeacherCommand({ action: "quiz_reveal" })}>정답 공개</button>
        <button type="button" className="review-secondary-action" disabled={!revealed} onClick={() => sendTeacherCommand({ action: "quiz_next" })}>{isLast ? "알게 된 점 쓰기" : "다음 문제"}</button>
        <button type="button" className="review-quiet-action" onClick={downloadClassResult}>기록 저장</button>
      </div>
    </main>
  );
}

function StudentReflection(): JSX.Element {
  const saved = useGameStore((state) => state.reflectionSaved);
  const [text, setText] = useState(saved?.text ?? "");
  useEffect(() => {
    if (saved?.text !== undefined) setText(saved.text);
  }, [saved?.text]);
  const length = text.replace(/\s/g, "").length;
  const canSubmit = length >= MODE4_REFLECTION_MIN_LENGTH;
  return (
    <main className="mode4-review-screen student-review-screen reflection-review-screen">
      <ReviewHeader eyebrow="4번 게임 · 마지막 기록" title="알게 된 점을 남겨요" detail={`${length} / ${MODE4_REFLECTION_MIN_LENGTH}자`} />
      <section className="reflection-board">
        <div className="reflection-spark" aria-hidden="true"><PixelSpeciesIcon speciesId="clover" /></div>
        <h2>{MODE4_REFLECTION_PROMPT}</h2>
        <textarea value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder="먹이사슬과 먹이그물을 관찰하며 알게 된 점을 써 보세요." />
        <div className="reflection-meter"><span style={{ width: `${Math.min(100, (length / MODE4_REFLECTION_MIN_LENGTH) * 100)}%` }} /></div>
        <div className="reflection-actions">
          <small>{canSubmit ? "작성한 내용을 제출할 수 있어요." : `${MODE4_REFLECTION_MIN_LENGTH - length}자 더 써 보세요.`}</small>
          <button type="button" className="review-primary-action" disabled={!canSubmit} onClick={() => sendReflection(text)}>기록 제출</button>
        </div>
        {saved?.submitted && <p className="reflection-saved">기록을 저장했어요. 선생님 화면에서 함께 볼 수 있어요.</p>}
      </section>
    </main>
  );
}

function ReflectionAnswerModal({ entry, onClose }: { entry: ReflectionProgressEntry; onClose: () => void }): JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="reflection-answer-backdrop" role="presentation" onClick={onClose}>
      <section className="reflection-answer-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-answer-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2 id="reflection-answer-title">{entry.playerName}의 기록</h2>
          <button type="button" onClick={onClose} aria-label="기록 닫기">×</button>
        </header>
        <p>{entry.text}</p>
      </section>
    </div>
  );
}

function TeacherReflection({ progress }: { progress: ReflectionProgress | null }): JSX.Element {
  const [selectedEntry, setSelectedEntry] = useState<ReflectionProgressEntry | null>(null);

  return (
    <main className="mode4-review-screen teacher-review-screen reflection-teacher-screen">
      <ReviewHeader eyebrow="교사 진행 화면 · 학생 기록" title="알게 된 점 모아 보기" detail={`${progress?.submittedCount ?? 0}명 제출`} />
      <section className="reflection-list-board">
        <div className="reflection-list-heading"><span>탐험대 기록</span><small>{progress?.submittedCount ?? 0} / {progress?.total ?? 0}</small></div>
        <div className="reflection-list">
          {(progress?.entries ?? []).map((entry) => {
            const canOpen = entry.submitted && Boolean(entry.text.trim());
            return (
              <article
                key={entry.playerId}
                className={`${entry.submitted ? "submitted" : "waiting"} ${canOpen ? "clickable" : ""}`}
                role={canOpen ? "button" : undefined}
                tabIndex={canOpen ? 0 : undefined}
                aria-label={canOpen ? `${entry.playerName}의 기록 크게 보기` : undefined}
                onClick={() => { if (canOpen) setSelectedEntry(entry); }}
                onKeyDown={(event) => {
                  if (canOpen && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setSelectedEntry(entry);
                  }
                }}
              >
                <strong>{entry.playerName}</strong>
                <p>{entry.submitted ? entry.text : "작성 중…"}</p>
              </article>
            );
          })}
          {!progress?.total && <p className="reflection-empty">학생이 들어오면 기록이 여기에 보여요.</p>}
        </div>
      </section>
      <div className="review-teacher-actions">
        <button type="button" className="review-primary-action" onClick={() => sendTeacherCommand({ action: "reflection_finish" })}>수업 마무리</button>
        <button type="button" className="review-quiet-action" onClick={downloadClassResult}>기록 저장</button>
      </div>
      {selectedEntry && <ReflectionAnswerModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </main>
  );
}

function LessonComplete(): JSX.Element {
  const role = useGameStore((state) => state.role);
  const progress = useGameStore((state) => state.reflectionProgress);
  if (role !== "teacher") {
    return <main className="mode4-review-screen student-review-screen lesson-complete-screen"><ReviewHeader eyebrow="오늘의 생태계 수업" title="선생님의 화면을 보세요" /><p>선생님이 수업을 마무리하고 있어요.</p></main>;
  }
  return (
    <main className="mode4-review-screen teacher-review-screen lesson-complete-screen">
      <ReviewHeader eyebrow="오늘의 생태계 수업" title="탐험 기록이 완성됐어요" detail={`${progress?.submittedCount ?? 0}명 기록`} />
      <section className="lesson-complete-board"><span className="complete-mark">끝</span><h2>먹이사슬과 먹이그물을<br />함께 관찰했어요.</h2><p>저장한 기록은 수업 결과 파일에 들어 있어요.</p></section>
      <div className="review-teacher-actions"><button type="button" className="review-primary-action" onClick={downloadClassResult}>기록 저장</button><button type="button" className="review-secondary-action" onClick={() => sendTeacherCommand({ action: "next_phase", phase: "mode_setup" })}>다음 활동 준비</button><button type="button" className="review-quiet-action" onClick={() => void leaveClass()}>나가기</button></div>
    </main>
  );
}

export function Mode4ReviewScreen(): JSX.Element {
  const role = useGameStore((state) => state.role);
  const phase = useGameStore((state) => state.snapshot.phase);
  const questionIndex = Math.min(MODE4_QUIZ_QUESTIONS.length - 1, Math.max(0, useGameStore((state) => state.snapshot.quizQuestionIndex)));
  const revealed = useGameStore((state) => state.snapshot.quizRevealed);
  const reveal = useGameStore((state) => state.quizReveal);
  const quizProgress = useGameStore((state) => state.quizProgress);
  const reflectionProgress = useGameStore((state) => state.reflectionProgress);

  if (phase === "lesson_complete") return <LessonComplete />;
  if (phase === "mode4_reflection") return role === "teacher" ? <TeacherReflection progress={reflectionProgress} /> : <StudentReflection />;
  return role === "teacher"
    ? <TeacherQuiz questionIndex={questionIndex} revealed={revealed} progress={quizProgress} />
    : <StudentQuiz questionIndex={questionIndex} revealed={revealed} reveal={reveal} />;
}

export default Mode4ReviewScreen;
