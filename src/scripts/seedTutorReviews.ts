import 'dotenv/config';
import mongoose from 'mongoose';
import Tutor from '../models/Tutor';
import FinalClass from '../models/FinalClass';
import TutorFeedback from '../models/TutorFeedback';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  // eslint-disable-next-line no-console
  console.error('[seedTutorReviews] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log('[seedTutorReviews] Connected to MongoDB');
}

function formatMonth(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function main() {
  await connect();

  const tutors = await Tutor.find({});
  // eslint-disable-next-line no-console
  console.log(`[seedTutorReviews] Found ${tutors.length} tutors`);

  const now = new Date();
  const thisMonth = formatMonth(now);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = formatMonth(prevMonthDate);

  for (const tutor of tutors as any[]) {
    try {
      const tutorId = String(tutor._id);

      const existingCount = await TutorFeedback.countDocuments({ tutor: tutor._id });
      if (existingCount >= 2) {
        // eslint-disable-next-line no-console
        console.log(`[seedTutorReviews] Tutor ${tutorId} already has ${existingCount} feedbacks, skipping`);
        continue;
      }

      // Try to find any class for this tutor (by tutor or tutorUser field)
      const cls = await FinalClass.findOne({
        $or: [
          { tutor: tutor.user },
          { tutorUser: tutor.user },
          { tutor: tutor._id },
        ],
      }).select('_id studentName subject grade');

      if (!cls) {
        // eslint-disable-next-line no-console
        console.log(`[seedTutorReviews] Tutor ${tutorId} has no classes, skipping feedback seeding`);
        continue;
      }

      const comments = [
        'Very professional and punctual. My child enjoys the classes.',
        'Explains concepts clearly and gives regular practice. Happy with the progress.',
      ];

      const months = [thisMonth, prevMonth];

      for (let i = 0; i < 2; i++) {
        const month = months[i] || thisMonth;

        // Avoid violating unique index: (tutor, finalClass, month, submittedBy)
        const submittedBy = tutor.user; // use tutor.user just as a simple reference; only name is shown publicly

        const already = await TutorFeedback.findOne({
          tutor: tutor._id,
          finalClass: cls._id,
          month,
          submittedBy,
        });
        if (already) continue;

        const overallRating = 4 + i * 0.5; // 4.0, 4.5

        const feedback = await TutorFeedback.create({
          tutor: tutor._id,
          finalClass: cls._id,
          submittedBy,
          submitterRole: 'PARENT',
          month,
          overallRating,
          teachingQuality: overallRating,
          punctuality: overallRating,
          communication: overallRating,
          subjectKnowledge: overallRating,
          comments: comments[i] || comments[0],
          strengths: 'Good explanation and regular follow-up.',
          improvements: 'Can share a bit more homework for extra practice.',
          wouldRecommend: true,
        } as any);

        // Update tutor aggregate rating fields
        const total = (tutor.totalRatings || 0) + 1;
        const newAvg = (((tutor.ratings || 0) * (tutor.totalRatings || 0)) + overallRating) / total;
        tutor.totalRatings = total;
        tutor.ratings = Number(newAvg.toFixed(2));
        await tutor.save();

        // eslint-disable-next-line no-console
        console.log('[seedTutorReviews] Created feedback', {
          tutorId,
          feedbackId: String((feedback as any)._id),
          month,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[seedTutorReviews] Error seeding tutor', String((tutor as any)?._id), e);
    }
  }
}

main()
  .then(() => mongoose.disconnect())
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('[seedTutorReviews] Done');
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error('[seedTutorReviews] Failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
