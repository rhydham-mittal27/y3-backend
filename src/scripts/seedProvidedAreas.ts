
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Option from '../models/Option';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`[seedProvidedAreas] MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`[seedProvidedAreas] Error: ${error.message}`);
    process.exit(1);
  }
};

const bhopalAreas = [
  "Airport Road", "Anand Nagar", "Arera Colony", "Arera Hills", "Ashoka Garden",
  "Ayodhya Bypass", "Ayodhya Nagar", "Bagh Mughaliya", "Bagh Sewania", "Bairagarh",
  "Bairasia Road", "Barkheda", "Barkhedi", "Berasia Road", "BHEL", "Bhopal Talkies",
  "Bittan Market", "Budhwara", "Chandbad", "Char Imli", "Chhola", "Chhola Mandir",
  "Chuna Bhatti", "Danish Kunj", "Danish Nagar", "E-7 Arera Colony", "Gautam Nagar",
  "Ginnori", "Govindpura", "Gulmohar Colony", "Habibganj", "Hamidia Road",
  "Hoshangabad Road", "Idgah Hills", "Indrapuri", "Jahangirabad", "Jawahar Chowk",
  "Kaliyasot Dam Road", "Kamla Nagar", "Karond", "Katara Hills", "Kolar Road",
  "Kotra Sultanabad", "Lalghati", "M.P. Nagar", "Maharana Pratap Nagar",
  "Malviya Nagar", "Mandideep", "Manisha Market", "Misrod", "MP Nagar Zone I",
  "MP Nagar Zone II", "MP Nagar Zone III", "Narela Shankari", "Nariyalkheda",
  "Nayapura", "Neelbad", "New Market", "Nishatpura", "Padmanabh Nagar",
  "Panchsheel Nagar", "Parshvnath Colony", "Piplani", "Prempura", "Professor Colony",
  "Raisen Road", "Rajeev Nagar", "Ratanpur Sadak", "Rohit Nagar", "Roshanpura",
  "Saket Nagar", "Salaiya", "Santoshi Nagar", "Sarvdharm Colony", "Shahjahanabad",
  "Shahpura", "Shakti Nagar", "Shastri Nagar", "Shivaji Nagar", "Shyamla Hills",
  "Sindhi Colony", "Subhash Nagar", "TT Nagar", "Tulsi Nagar", "Vidya Nagar",
  "Vidisha Road", "Vijay Nagar", "VIP Road", "Wardhaman Nagar", "Yashoda Vihar",
  "Zone I MP Nagar", "Zone II MP Nagar", "Zone III MP Nagar"
];

const indoreAreas = [
  "AB Road", "Aerodrome Road", "Agrawal Nagar", "Airport Road", "Annapurna Road",
  "Annapurna Nagar", "Azad Nagar", "Banganga", "Bengali Square", "Bhawarkuan",
  "Bicholi Hapsi", "Bicholi Mardana", "Bijalpur", "Bombay Hospital Road",
  "Brahmapuri Colony", "Chandan Nagar", "Chhatribagh", "Dewas Naka", "Dhar Road",
  "Dwarkapuri", "Goyal Nagar", "Gumasta Nagar", "Hawa Bangla", "Indore GPO",
  "Indrapuri Colony", "Jail Road", "Juni Indore", "Kalani Nagar", "Kanadia Road",
  "Khajrana", "Khatiwala Tank", "Khandwa Road", "Krishna Bagh Colony", "LIG Colony",
  "Lokmanya Nagar", "Mahalaxmi Nagar", "Mahesh Nagar", "Malharganj", "Manik Bagh",
  "Manorama Ganj", "Marimata Square", "Mayakhedi", "MG Road", "Mhow", "MIG Colony",
  "Musakhedi", "Nanda Nagar", "Napania", "Navlakha", "Nehru Nagar", "New Palasia",
  "Nipania", "Old Palasia", "Pagnis Paga", "Palakhedi", "Palasia", "Pardesipura",
  "Patel Nagar", "Patnipura", "Pipliyahana", "Pipliyapala", "Rajendra Nagar",
  "Rajwada", "Rau", "Ring Road", "Saket Nagar", "Sanchar Nagar", "Sangam Nagar",
  "Scheme 54", "Scheme 74", "Scheme 78", "Scheme 94", "Scheme No 140", "Shivaji Nagar",
  "Shri Nagar Extension", "Silicon City", "Snehlataganj", "Sudama Nagar",
  "Super Corridor", "Talawali Chanda", "Tilak Nagar", "Transport Nagar", "Usha Nagar",
  "Vaishali Nagar", "Vallabh Nagar", "Vijay Nagar", "Vikas Nagar", "Vinoba Nagar",
  "Yashwant Niwas Road", "Yeshwant Colony", "Yeshwant Road", "Zanjeerwala Square"
];

function slugify(text: string) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const seed = async () => {
  await connectDB();

  try {
    const cities = [
      { label: 'Bhopal', value: 'BHOPAL', areas: bhopalAreas },
      { label: 'Indore', value: 'INDORE', areas: indoreAreas }
    ];

    for (const cityData of cities) {
      console.log(`Processing city: ${cityData.label}`);
      
      const cityOption = await Option.findOneAndUpdate(
        { type: 'CITY', value: cityData.value, parent: null },
        {
          $set: {
            label: cityData.label,
            isActive: true,
          },
          $setOnInsert: {
            type: 'CITY',
            value: cityData.value,
            parent: null,
            sortOrder: cityData.value === 'BHOPAL' ? 1 : 2,
            metadata: { cityCode: cityData.value === 'BHOPAL' ? 'bpl' : 'ind' }
          },
        },
        { upsert: true, new: true }
      );

      console.log(`Verified city option: ${cityData.label} (${cityOption._id})`);

      const areaType = `AREA_${cityData.value}`;
      
      // Clear existing areas for this city to remove placeholders
      const deleteResult = await Option.deleteMany({ type: areaType, parent: cityOption._id });
      console.log(`Cleared ${deleteResult.deletedCount} existing areas for ${cityData.label}`);
      
      let count = 0;
      for (let i = 0; i < cityData.areas.length; i++) {
        const label = cityData.areas[i];
        const value = slugify(label);

        await Option.findOneAndUpdate(
          { type: areaType, value, parent: cityOption._id },
          {
            $set: {
              label,
              sortOrder: i + 1,
              isActive: true,
            },
            $setOnInsert: {
              type: areaType,
              value,
              parent: cityOption._id,
            },
          },
          { upsert: true, new: true }
        );
        count++;
      }
      console.log(`Seed ${count} areas for ${cityData.label}`);
    }

    console.log('✅ Seeding completed successfully');
  } catch (error) {
    console.error('Error seeding areas:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

seed();
