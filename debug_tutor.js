const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function checkTutor() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI not found in .env');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Tutor = mongoose.model('Tutor', new mongoose.Schema({ 
        documents: Array,
        user: mongoose.Schema.Types.ObjectId,
        teacherId: String
    }));

    const imageName = 'Screenshot-2026-03-19-205404-1774267533619-686a37f3.png';
    const tutor = await Tutor.findOne({ 'documents.documentUrl': { $regex: imageName } });

    if (!tutor) {
      console.log('Tutor not found for image:', imageName);
    } else {
      console.log('Tutor found:', tutor._id);
      const doc = tutor.documents.find(d => d.documentUrl.includes(imageName));
      console.log('Document Metadata:', JSON.stringify(doc, null, 2));
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkTutor();
