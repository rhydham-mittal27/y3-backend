import 'dotenv/config';
import mongoose from 'mongoose';
import Option from '../models/Option';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  console.error('[seedCurriculumHierarchy] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

type SeedNode = {
  type: string;
  label: string;
  value: string;
  sortOrder?: number;
  metadata?: Record<string, any>;
  children?: SeedNode[];
};

const upsertOption = async (node: Omit<SeedNode, 'children'>, parentId: mongoose.Types.ObjectId | null) => {
  const doc = await Option.findOneAndUpdate(
    { type: node.type, value: node.value, parent: parentId },
    {
      type: node.type,
      label: node.label,
      value: node.value,
      parent: parentId,
      isActive: true,
      sortOrder: node.sortOrder ?? 0,
      metadata: node.metadata ?? {},
    },
    { upsert: true, new: true }
  );
  return doc;
};

const mkChapters = (count: number): SeedNode[] => {
  const out: SeedNode[] = [];
  for (let i = 1; i <= count; i++) {
    out.push({
      type: 'CHAPTER',
      label: `Chapter ${i}`,
      value: `CHAPTER_${i}`,
      sortOrder: i,
      metadata: { index: i },
    });
  }
  return out;
};

const SUBJECTS_9_10: SeedNode[] = [
  { type: 'SUBJECT', label: 'Mathematics', value: 'MATHEMATICS', sortOrder: 1, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'Science', value: 'SCIENCE', sortOrder: 2, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'English', value: 'ENGLISH', sortOrder: 3, children: mkChapters(15) },
  { type: 'SUBJECT', label: 'Hindi', value: 'HINDI', sortOrder: 4, children: mkChapters(15) },
  { type: 'SUBJECT', label: 'Social Science', value: 'SOCIAL_SCIENCE', sortOrder: 5, children: mkChapters(20) },
];

const SUBJECTS_11_12_NONMED: SeedNode[] = [
  { type: 'SUBJECT', label: 'Physics', value: 'PHYSICS', sortOrder: 1, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'Chemistry', value: 'CHEMISTRY', sortOrder: 2, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'Mathematics', value: 'MATHEMATICS', sortOrder: 3, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'English', value: 'ENGLISH', sortOrder: 4, children: mkChapters(15) },
];

const SUBJECTS_11_12_MED: SeedNode[] = [
  { type: 'SUBJECT', label: 'Physics', value: 'PHYSICS', sortOrder: 1, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'Chemistry', value: 'CHEMISTRY', sortOrder: 2, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'Biology', value: 'BIOLOGY', sortOrder: 3, children: mkChapters(25) },
  { type: 'SUBJECT', label: 'English', value: 'ENGLISH', sortOrder: 4, children: mkChapters(15) },
];

const SUBJECTS_11_12_ARTS: SeedNode[] = [
  { type: 'SUBJECT', label: 'History', value: 'HISTORY', sortOrder: 1, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'Geography', value: 'GEOGRAPHY', sortOrder: 2, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'Political Science', value: 'POLITICAL_SCIENCE', sortOrder: 3, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'Economics', value: 'ECONOMICS', sortOrder: 4, children: mkChapters(20) },
  { type: 'SUBJECT', label: 'English', value: 'ENGLISH', sortOrder: 5, children: mkChapters(15) },
];

const SUBJECTS_JEE: SeedNode[] = [
  { type: 'SUBJECT', label: 'Physics', value: 'PHYSICS', sortOrder: 1, children: mkChapters(35) },
  { type: 'SUBJECT', label: 'Chemistry', value: 'CHEMISTRY', sortOrder: 2, children: mkChapters(35) },
  { type: 'SUBJECT', label: 'Mathematics', value: 'MATHEMATICS', sortOrder: 3, children: mkChapters(35) },
];

const SUBJECTS_NEET: SeedNode[] = [
  { type: 'SUBJECT', label: 'Physics', value: 'PHYSICS', sortOrder: 1, children: mkChapters(35) },
  { type: 'SUBJECT', label: 'Chemistry', value: 'CHEMISTRY', sortOrder: 2, children: mkChapters(35) },
  { type: 'SUBJECT', label: 'Biology', value: 'BIOLOGY', sortOrder: 3, children: mkChapters(35) },
];

const buildSeedTree = (): SeedNode[] => {
  const boards: SeedNode[] = [
    { type: 'BOARD', label: 'CBSE', value: 'CBSE', sortOrder: 1 },
    { type: 'BOARD', label: 'ICSE', value: 'ICSE', sortOrder: 2 },
    { type: 'BOARD', label: 'IGCSE', value: 'IGCSE', sortOrder: 3 },
    { type: 'BOARD', label: 'MPBSE', value: 'MPBSE', sortOrder: 4 },
  ];

  const mkAllSubjects = (): SeedNode[] => [
    {
      type: 'SUBJECT',
      label: 'All Subjects',
      value: 'ALL_SUBJECTS',
      sortOrder: 1,
      metadata: { special: true },
    },
  ];

  const mkClassNodes = (): SeedNode[] => {
    const classNodes: SeedNode[] = [];

    classNodes.push({
      type: 'GRADE',
      label: 'Nursery',
      value: 'NURSERY',
      sortOrder: 1,
      children: mkAllSubjects(),
    });
    classNodes.push({
      type: 'GRADE',
      label: 'LKG',
      value: 'LKG',
      sortOrder: 2,
      children: mkAllSubjects(),
    });
    classNodes.push({
      type: 'GRADE',
      label: 'UKG',
      value: 'UKG',
      sortOrder: 3,
      children: mkAllSubjects(),
    });

    for (let c = 1; c <= 10; c++) {
      const base: SeedNode = {
        type: 'GRADE',
        label: `Class ${c}`,
        value: `CLASS_${c}`,
        sortOrder: c + 3,
      };

      if (c <= 8) {
        base.children = mkAllSubjects();
      } else {
        base.children = SUBJECTS_9_10;
      }

      classNodes.push(base);
    }

    classNodes.push({
      type: 'GRADE',
      label: 'Class 11 (Non-Med)',
      value: 'CLASS_11_NONMED',
      sortOrder: 14,
      metadata: { stream: 'NONMED' },
      children: SUBJECTS_11_12_NONMED,
    });
    classNodes.push({
      type: 'GRADE',
      label: 'Class 11 (Med)',
      value: 'CLASS_11_MED',
      sortOrder: 15,
      metadata: { stream: 'MED' },
      children: SUBJECTS_11_12_MED,
    });
    classNodes.push({
      type: 'GRADE',
      label: 'Class 11 (Arts)',
      value: 'CLASS_11_ARTS',
      sortOrder: 16,
      metadata: { stream: 'ARTS' },
      children: SUBJECTS_11_12_ARTS,
    });

    classNodes.push({
      type: 'GRADE',
      label: 'Class 12 (Non-Med)',
      value: 'CLASS_12_NONMED',
      sortOrder: 17,
      metadata: { stream: 'NONMED' },
      children: SUBJECTS_11_12_NONMED,
    });
    classNodes.push({
      type: 'GRADE',
      label: 'Class 12 (Med)',
      value: 'CLASS_12_MED',
      sortOrder: 18,
      metadata: { stream: 'MED' },
      children: SUBJECTS_11_12_MED,
    });
    classNodes.push({
      type: 'GRADE',
      label: 'Class 12 (Arts)',
      value: 'CLASS_12_ARTS',
      sortOrder: 19,
      metadata: { stream: 'ARTS' },
      children: SUBJECTS_11_12_ARTS,
    });

    classNodes.push({
      type: 'GRADE',
      label: 'JEE',
      value: 'JEE',
      sortOrder: 20,
      metadata: { exam: 'JEE' },
      children: SUBJECTS_JEE,
    });

    classNodes.push({
      type: 'GRADE',
      label: 'NEET',
      value: 'NEET',
      sortOrder: 21,
      metadata: { exam: 'NEET' },
      children: SUBJECTS_NEET,
    });

    return classNodes;
  };

  const classNodes = mkClassNodes();
  for (const b of boards) {
    b.children = classNodes;
  }

  return boards;
};

const seedTree = async (nodes: SeedNode[], parentId: mongoose.Types.ObjectId | null) => {
  for (const node of nodes) {
    const { children, ...self } = node;
    const saved = await upsertOption(self, parentId);
    if (children && children.length) {
      await seedTree(children, saved._id);
    }
  }
};

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const tree = buildSeedTree();
  await seedTree(tree, null);

  console.log('✅ Curriculum hierarchy seeded successfully');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('Failed to seed curriculum hierarchy', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
