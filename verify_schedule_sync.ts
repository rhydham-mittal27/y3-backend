import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './src/config/database';

async function verify() {
  await connectDB();
  
  // Use existing models from mongoose.models to avoid registration errors
  const ClassLead = mongoose.models.ClassLead || require('./src/models/ClassLead').default;
  const FinalClass = mongoose.models.FinalClass || require('./src/models/FinalClass').default;
  const Groupleads = mongoose.models.Groupleads || require('./src/models/GroupClass').default;
  const leadService = require('./src/services/leadService');
  const finalClassService = require('./src/services/finalClassService');
  const { BOARD_TYPE, TEACHING_MODE, CLASS_LEAD_STATUS } = require('./src/config/constants');

  const managerId = new mongoose.Types.ObjectId().toString(); // dummy manager
  const tutorId = new mongoose.Types.ObjectId().toString(); // dummy tutor
  
  // 1. Create a Class Lead with schedule
  console.log('Creating Class Lead...');
  const leadData = {
    studentType: 'SINGLE',
    studentName: 'Test Schedule Student',
    studentGender: 'M',
    board: BOARD_TYPE.CBSE,
    mode: TEACHING_MODE.ONLINE,
    grade: 'Grade 10',
    subject: ['Mathematics'],
    timing: '10:30 AM - 11:30 AM',
    weekdays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    createdBy: managerId,
    assignedTutor: tutorId,
    status: CLASS_LEAD_STATUS.DEMO_APPROVED_BY_PARENT,
  };
  
  const lead = await leadService.createClassLead(leadData);
  console.log('Lead created:', lead.leadId);
  console.log('Lead weekdays:', lead.weekdays);
  
  // 2. Convert to Final Class
  console.log('Converting to Final Class...');
  const conversionResult = await finalClassService.convertLeadToFinalClass({
    classLeadId: lead._id.toString(),
    tutorId: lead.assignedTutor.toString(),
    coordinatorUserId: managerId,
    startDate: new Date(),
    convertedBy: managerId,
    monthlyFees: 1000,
    tutorMonthlyFees: 800
  });
  
  const finalClassId = conversionResult._id;
  const finalClass = await FinalClass.findById(finalClassId);
  
  // 3. Verify Schedule
  console.log('Verifying Final Class Schedule...');
  if (finalClass && finalClass.schedule) {
    console.log('Days of Week:', finalClass.schedule.daysOfWeek);
    console.log('Time Slot:', finalClass.schedule.timeSlot);
    
    const expectedDays = ['MONDAY', 'WEDNESDAY', 'FRIDAY'];
    const expectedTime = '10:30 AM - 11:30 AM';
    
    const daysMatch = JSON.stringify(finalClass.schedule.daysOfWeek) === JSON.stringify(expectedDays);
    const timeMatch = finalClass.schedule.timeSlot === expectedTime;
    
    if (daysMatch && timeMatch) {
      console.log('SUCCESS: Schedule synchronized correctly!');
    } else {
      console.error('FAILURE: Schedule mismatch!');
      if (!daysMatch) console.error('Expected days:', expectedDays, 'Got:', finalClass.schedule.daysOfWeek);
      if (!timeMatch) console.error('Expected time:', expectedTime, 'Got:', finalClass.schedule.timeSlot);
    }
  } else {
    console.error('FAILURE: Final Class or Schedule NOT FOUND');
  }
  
  // Cleanup
  await ClassLead.deleteOne({ _id: lead._id });
  await FinalClass.deleteOne({ _id: finalClassId });
  
  console.log('Verification finished.');
  
  await mongoose.disconnect();
  process.exit(0);
}

verify().catch(e => {
    console.error('Verification failed:', e);
    process.exit(1);
});
