import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

const groq = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY ?? '',
  model: 'llama-3.1-8b-instant',
  temperature: 0.4,
  maxTokens: 400,
});

const parser = new StringOutputParser();

// ─── Progress Insight ─────────────────────────────────────────────────────────

const progressInsightPrompt = ChatPromptTemplate.fromTemplate(`
You are an empathetic academic advisor writing a short insight for a parent about their child's tutoring progress.

Student: {studentName}
Subject: {subject}
Trend: {trend}
Recent test scores (newest first): {scores}
Attendance rate: {attendanceRate}
Strong topics: {strongTopics}
Weak topics: {weakTopics}
Tutor remark: {tutorRemark}

Write a 2-3 sentence parent-facing insight. Be warm, specific, and actionable.
- If improving: celebrate with one concrete next step.
- If declining: be honest but supportive, suggest one focus area.
- If steady: acknowledge and suggest what would push to the next level.
- Mention a specific topic or score if available.
- Do NOT start with "I" or use em dashes.
- Output only the insight text, no labels or headings.
`);

export const generateProgressInsight = async (data: {
  studentName: string;
  subject: string;
  trend: 'IMPROVING' | 'STEADY' | 'NEEDS_ATTENTION';
  scores: Array<{ score: number; totalMarks: number; date: string }>;
  attendanceRate?: number;
  strongTopics: string[];
  weakTopics: string[];
  tutorRemark?: string;
}): Promise<string> => {
  if (!process.env.GROQ_API_KEY) return '';

  const chain = RunnableSequence.from([progressInsightPrompt, groq, parser]);

  const scoreStr = data.scores
    .slice(0, 5)
    .map((s, i) => `Test ${i + 1}: ${s.score}/${s.totalMarks} (${Math.round((s.score / s.totalMarks) * 100)}%)`)
    .join(', ');

  try {
    return await chain.invoke({
      studentName:  data.studentName || 'your child',
      subject:      data.subject || 'the subject',
      trend:        data.trend,
      scores:       scoreStr || 'No recent tests',
      attendanceRate: data.attendanceRate != null ? `${data.attendanceRate}%` : 'Not available',
      strongTopics: data.strongTopics.length ? data.strongTopics.join(', ') : 'None identified yet',
      weakTopics:   data.weakTopics.length ? data.weakTopics.join(', ') : 'None identified yet',
      tutorRemark:  data.tutorRemark || 'No remark yet',
    });
  } catch {
    return '';
  }
};

// ─── Weak-topic Study Tips ────────────────────────────────────────────────────

const studyTipPrompt = ChatPromptTemplate.fromTemplate(`
You are a concise academic tutor. A student is struggling with a specific topic.

Student name: {studentName}
Subject: {subject}
Weak topic: {topic}
Recent scores in this area: {scores}

Give exactly 3 practical study tips for this topic. Format as a numbered list (1. 2. 3.).
Each tip should be 1 sentence, specific, and actionable.
No preamble, no headings — just the 3 tips.
`);

export const generateStudyTips = async (data: {
  studentName: string;
  subject: string;
  topic: string;
  scores?: string;
}): Promise<string[]> => {
  if (!process.env.GROQ_API_KEY) return [];

  const chain = RunnableSequence.from([studyTipPrompt, groq, parser]);

  try {
    const raw = await chain.invoke({
      studentName: data.studentName || 'the student',
      subject:     data.subject || 'the subject',
      topic:       data.topic,
      scores:      data.scores || 'Not available',
    });

    return raw
      .split('\n')
      .map((l) => l.replace(/^\d+\.\s*/, '').trim())
      .filter((l) => l.length > 10)
      .slice(0, 3);
  } catch {
    return [];
  }
};

// ─── Weekly Summary for Parent ────────────────────────────────────────────────

const weeklySummaryPrompt = ChatPromptTemplate.fromTemplate(`
You are an academic coordinator summarising a student's week for their parent.

Student: {studentName}
Sessions this week: {sessions}
Topics covered: {topics}
Test result (if any): {testResult}
Attendance: {attendance}

Write a 2-sentence WhatsApp-style weekly update. Be warm and specific.
No labels, no headings — just the message text.
`);

export const generateWeeklySummary = async (data: {
  studentName: string;
  sessions: number;
  topics: string[];
  testResult?: string;
  attendance: string;
}): Promise<string> => {
  if (!process.env.GROQ_API_KEY) return '';

  const chain = RunnableSequence.from([weeklySummaryPrompt, groq, parser]);

  try {
    return await chain.invoke({
      studentName: data.studentName,
      sessions:    String(data.sessions),
      topics:      data.topics.length ? data.topics.join(', ') : 'General revision',
      testResult:  data.testResult || 'No test this week',
      attendance:  data.attendance,
    });
  } catch {
    return '';
  }
};

// ─── On-demand Chat ───────────────────────────────────────────────────────────

const chatPrompt = ChatPromptTemplate.fromTemplate(`
You are a friendly academic advisor helping a parent understand their child's tutoring progress.

STRICT RULE: Only use information explicitly provided below. Never invent scores, topics, dates, or remarks that are not listed. If data is marked "Not available", say so honestly and suggest the parent ask their coordinator.

=== STUDENT DATA ===
Name: {studentName}
Subjects: {subjects}
Overall trend: {trend}
Attendance rate: {attendanceRate}
Current cycle: {currentCycle}

Recent tests (newest first):
{testHistory}

Syllabus coverage per subject:
{syllabusCoverage}

Weak topics: {weakTopics}
Strong topics: {strongTopics}
Latest tutor remarks: {tutorRemarks}
===================

Parent's question: {question}

Answer in 3-4 sentences. Be warm, specific, and grounded only in the data above.
If the question asks about something not in the data, say you don't have that information and suggest contacting the coordinator.
Do not start with "I". No em dashes.
`);

export const answerParentQuestion = async (data: {
  studentName: string;
  subjects: string;
  trend: string;
  attendanceRate: string;
  currentCycle: string;
  testHistory: string;
  syllabusCoverage: string;
  weakTopics: string;
  strongTopics: string;
  tutorRemarks: string;
  question: string;
}): Promise<string> => {
  if (!process.env.GROQ_API_KEY) return 'AI features are not configured yet. Please contact your coordinator directly.';

  const chain = RunnableSequence.from([chatPrompt, groq, parser]);

  try {
    return await chain.invoke(data);
  } catch (err: any) {
    return 'Unable to generate a response right now. Please try again shortly.';
  }
};
