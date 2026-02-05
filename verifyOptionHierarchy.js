const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const OptionSchema = new mongoose.Schema({
    type: { type: String, required: true },
    label: { type: String, required: true },
    value: { type: String, required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Option', default: null },
    isActive: { type: Boolean, default: true },
});

const Option = mongoose.model('Option', OptionSchema);

async function verifyHierarchy() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Check Boards
        const boards = await Option.find({ type: 'BOARD', isActive: true });
        console.log(`Found ${boards.length} Boards:`, boards.map(b => b.label).join(', '));

        if (boards.length === 0) {
            console.log('No boards found. Hierarchy verification failed at root level.');
            return;
        }

        // 2. Check Classes (should be type 'GRADE' or similar, parent should be one of the boards)
        // Assuming 'Class' in user request maps to 'GRADE' type option
        const firstBoard = boards[0];
        const classes = await Option.find({ type: 'GRADE', parent: firstBoard._id, isActive: true });
        console.log(`Found ${classes.length} Classes (Grades) for Board '${firstBoard.label}':`, classes.map(c => c.label).join(', '));

        if (classes.length === 0) {
            // Try finding any grade with a parent
            const anyGradeWithParent = await Option.findOne({ type: 'GRADE', parent: { $ne: null } });
            if (anyGradeWithParent) {
                console.log('Found a grade with parent:', anyGradeWithParent);
                const parent = await Option.findById(anyGradeWithParent.parent);
                console.log('Its parent is:', parent);
            } else {
                console.log('No Grades found with parent (Board). Hierarchy might be missing data.');
            }
        } else {
            // 3. Check Subjects (parent should be one of the classes)
            const firstClass = classes[0];
            const subjects = await Option.find({ type: 'SUBJECT', parent: firstClass._id, isActive: true });
            console.log(`Found ${subjects.length} Subjects for Class '${firstClass.label}':`, subjects.map(s => s.label).join(', '));

            if (subjects.length === 0) {
                console.log('No Subjects found for the first class.');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyHierarchy();
