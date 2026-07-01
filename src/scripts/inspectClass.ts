import 'dotenv/config';
import mongoose from 'mongoose';
import FinalClass from '../models/FinalClass';
import ClassSession from '../models/ClassSession';
import AttendanceSheet from '../models/AttendanceSheet';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✓ Connected\n');

  const cls: any = await FinalClass.findOne({ studentName: /tesha/i }).lean();
  if (!cls) { console.log('Class not found'); return; }

  console.log('═══ CLASS ═══════════════════════════════');
  console.log('ID          :', String(cls._id));
  console.log('Name        :', cls.className);
  console.log('Student     :', cls.studentName);
  console.log('Status      :', cls.status);
  console.log('Schedule    :', JSON.stringify(cls.schedule));
  console.log('Classes/mo  :', cls.classesPerMonth);
  console.log('CycleStart? :', cls.cycleStartPending);
  console.log('CycleNumber :', cls.currentCycleNumber);
  console.log('Completed   :', cls.completedSessions);

  const sessions: any[] = await ClassSession.find({ finalClass: cls._id }).sort({ sessionDate: 1 }).lean();
  console.log('\n═══ SESSIONS (' + sessions.length + ') ════════════════════════');
  sessions.forEach(s => {
    console.log(` #${s.sessionNumber} | ${s.sessionDate.toISOString().split('T')[0]} | ${s.status} | cycle#${s.cycleNumber ?? '-'} cycleMonth:${s.cycleMonth}/${s.cycleYear}`);
  });

  const sheets: any[] = await AttendanceSheet.find({ finalClass: cls._id }).sort({ cycleNumber: 1 }).lean();
  console.log('\n═══ ATTENDANCE SHEETS (' + sheets.length + ') ════════════════');
  sheets.forEach(sheet => {
    const dates = (sheet.records || []).map((r: any) => new Date(r.sessionDate).toISOString().split('T')[0]);
    console.log(` Cycle ${sheet.cycleNumber} | ${sheet.year}-${String(sheet.month).padStart(2,'0')} | ${sheet.status} | ${sheet.records.length} records`);
    dates.forEach((d: string, i: number) => {
      const r = sheet.records[i];
      console.log(`   ${d} — ${r.status}`);
    });
  });
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
