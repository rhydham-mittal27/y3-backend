
import mongoose from 'mongoose';
import { faker } from '@faker-js/faker';
import User from './src/models/User';
import ClassLead from './src/models/ClassLead';
import FinalClass from './src/models/FinalClass';
import Payment from './src/models/Payment';
import { USER_ROLES, CLASS_LEAD_STATUS, FINAL_CLASS_STATUS, PAYMENT_STATUS, PAYMENT_TYPE } from './src/config/constants';
import dotenv from 'dotenv';

dotenv.config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to DB');

    const admin = await User.findOne({ role: USER_ROLES.ADMIN });
    const tutors = await User.find({ role: USER_ROLES.TUTOR });
    const parents = await User.find({ role: USER_ROLES.PARENT });

    if (!tutors.length || !parents.length) {
      console.log('Not enough tutors/parents');
      return;
    }

    console.log('creating 100 active classes...');
    
    const classes = [];
    for (let i = 0; i < 100; i++) {
       const tutor = tutors[Math.floor(Math.random() * tutors.length)];
       const parent = parents[Math.floor(Math.random() * parents.length)];
       const fees = faker.number.int({ min: 2000, max: 8000 }); // Random fees

       // Create Lead
       const lead = await ClassLead.create({
         studentName: faker.person.fullName(),
         subject: 'Maths',
         grade: '10th',
         board: 'CBSE',
         mode: 'ONLINE',
         status: CLASS_LEAD_STATUS.CONVERTED,
         createdBy: admin?._id,
         city: faker.location.city(),
         area: faker.location.street(),
         timing: '18:00', // Required
         paymentAmount: fees // Set payment amount on Lead
       });

       // Create Active Class
       const finalClass = await FinalClass.create({
         className: `${lead.studentName} - Maths`,
         classLead: lead._id,
         tutor: tutor._id,
         parent: parent._id,
         startDate: faker.date.recent({ days: 60 }),
         status: FINAL_CLASS_STATUS.ACTIVE,
         schedule: { daysOfWeek: ['Mon', 'Wed'], timeSlot: '18:00' },
         totalSessions: 20,
         completedSessions: 5,
         studentName: lead.studentName,
         subject: ['Maths'],
         grade: '10th',
         board: 'CBSE',
         mode: 'ONLINE',
         ratePerSession: fees / 10,
         // parentFees removed
         convertedBy: admin?._id,
         convertedAt: new Date()
       });
       
       // Create a Payment to ensure Revenue metrics also look good
       await Payment.create({
         finalClass: finalClass._id,
         attendance: undefined, // Advance payment
         tutor: tutor._id,
         amount: fees,
         currency: 'INR',
         status: PAYMENT_STATUS.PAID,
         paymentType: PAYMENT_TYPE.FEES_COLLECTED,
         dueDate: new Date(),
         paymentDate: new Date(),
         paidBy: parent._id,
         createdBy: admin?._id
       });

       classes.push(finalClass);
    }
    
    console.log(`Created ${classes.length} active classes with fees.`);

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
};

seed();
