import mongoose from 'mongoose';

const mongoUri = "mongodb+srv://admin_db_user:iswlSnyeTKjBNIMJ@ys-cluster.xtdjb5c.mongodb.net/main-db";

const checkOptions = async () => {
  try {
    console.log('Attempting to connect to:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));

    const Option = mongoose.connection.collection('options');
    
    // Check all options for subjects
    const subjects = await Option.find({ type: { $regex: /subject/i } }).toArray();
    console.log(`\nFound ${subjects.length} subject options`);

    subjects.slice(0, 10).forEach(s => {
      console.log(`ID: ${s._id}, Type: ${s.type}, Label: ${s.label}, Value: ${s.value}, Parent: ${s.parent}`);
    });

    // Check one tutor
    const Tutor = mongoose.connection.collection('tutors');
    const tutor = await Tutor.findOne({ verificationStatus: 'PENDING' });
    if (tutor) {
       console.log('\nSample Pending Tutor:');
       console.log('Tutor ID:', tutor._id);
       console.log('Subjects in DB (IDs):', tutor.subjects);
    } else {
       console.log('\nNo pending tutors found');
    }

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
};

checkOptions();
