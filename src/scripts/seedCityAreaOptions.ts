import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Option from '../models/Option';

dotenv.config();

const CITY_TYPE = 'CITY';

const cities: { label: string; value: string; sortOrder: number; metadata?: any }[] = [
  { 
    label: 'Bhopal', 
    value: 'BHOPAL', 
    sortOrder: 1, 
    metadata: { whatsappLink: '', cityCode: 'bpl' } 
  },
  { 
    label: 'Indore', 
    value: 'INDORE', 
    sortOrder: 2, 
    metadata: { whatsappLink: '', cityCode: 'ind' } 
  },
];

const indoreAreas: string[] = [
  'AB Road',
  'Aerodrome Road',
  'Agrawal Nagar',
  'Airport Road',
  'Annapurna Road',
  'Annapurna Nagar',
  'Azad Nagar',
  'Banganga',
  'Bengali Square',
  'Bhawarkuan',
  'Bicholi Hapsi',
  'Bicholi Mardana',
  'Bijalpur',
  'Bombay Hospital Road',
  'Brahmapuri Colony',
  'Chandan Nagar',
  'Chhatribagh',
  'Dewas Naka',
  'Dhar Road',
  'Dwarkapuri',
  'Goyal Nagar',
  'Gumasta Nagar',
  'Hawa Bangla',
  'Indore GPO',
  'Indrapuri Colony',
  'Jail Road',
  'Juni Indore',
  'Kalani Nagar',
  'Kanadia Road',
  'Khajrana',
  'Khatiwala Tank',
  'Khandwa Road',
  'Krishna Bagh Colony',
  'LIG Colony',
  'Lokmanya Nagar',
  'Mahalaxmi Nagar',
  'Mahesh Nagar',
  'Malharganj',
  'Manik Bagh',
  'Manorama Ganj',
  'Marimata Square',
  'Mayakhedi',
  'MG Road',
  'Mhow',
  'MIG Colony',
  'Musakhedi',
  'Nanda Nagar',
  'Napania',
  'Navlakha',
  'Nehru Nagar',
  'New Palasia',
  'Nipania',
  'Old Palasia',
  'Pagnis Paga',
  'Palakhedi',
  'Palasia',
  'Pardesipura',
  'Patel Nagar',
  'Patnipura',
  'Pipliyahana',
  'Pipliyapala',
  'Rajendra Nagar',
  'Rajwada',
  'Rau',
  'Ring Road',
  'Saket Nagar',
  'Sanchar Nagar',
  'Sangam Nagar',
  'Scheme 54',
  'Scheme 74',
  'Scheme 78',
  'Scheme 94',
  'Scheme No 140',
  'Shivaji Nagar',
  'Shri Nagar Extension',
  'Silicon City',
  'Snehlataganj',
  'Sudama Nagar',
  'Super Corridor',
  'Talawali Chanda',
  'Tilak Nagar',
  'Transport Nagar',
  'Usha Nagar',
  'Vaishali Nagar',
  'Vallabh Nagar',
  'Vijay Nagar',
  'Vikas Nagar',
  'Vinoba Nagar',
  'Yashwant Niwas Road',
  'Yeshwant Colony',
  'Yeshwant Road',
  'Zanjeerwala Square',
];

const bhopalAreas: string[] = [
  'Airport Road',
  'Anand Nagar',
  'Arera Colony',
  'Arera Hills',
  'Ashoka Garden',
  'Ayodhya Bypass',
  'Ayodhya Nagar',
  'Bagh Mughaliya',
  'Bagh Sewania',
  'Bairagarh',
  'Bairasia Road',
  'Barkheda',
  'Barkhedi',
  'Berasia Road',
  'BHEL',
  'Bhopal Talkies',
  'Bittan Market',
  'Budhwara',
  'Chandbad',
  'Char Imli',
  'Chhola',
  'Chhola Mandir',
  'Chuna Bhatti',
  'Danish Kunj',
  'Danish Nagar',
  'E-7 Arera Colony',
  'Gautam Nagar',
  'Ginnori',
  'Govindpura',
  'Gulmohar Colony',
  'Habibganj',
  'Hamidia Road',
  'Hoshangabad Road',
  'Idgah Hills',
  'Indrapuri',
  'Jahangirabad',
  'Jawahar Chowk',
  'Kaliyasot Dam Road',
  'Kamla Nagar',
  'Karond',
  'Katara Hills',
  'Kolar Road',
  'Kotra Sultanabad',
  'Lalghati',
  'M.P. Nagar',
  'Maharana Pratap Nagar',
  'Malviya Nagar',
  'Mandideep',
  'Manisha Market',
  'Misrod',
  'MP Nagar Zone I',
  'MP Nagar Zone II',
  'MP Nagar Zone III',
  'Narela Shankari',
  'Nariyalkheda',
  'Nayapura',
  'Neelbad',
  'New Market',
  'Nishatpura',
  'Padmanabh Nagar',
  'Panchsheel Nagar',
  'Parshvnath Colony',
  'Piplani',
  'Prempura',
  'Professor Colony',
  'Raisen Road',
  'Rajeev Nagar',
  'Ratanpur Sadak',
  'Rohit Nagar',
  'Roshanpura',
  'Saket Nagar',
  'Salaiya',
  'Santoshi Nagar',
  'Sarvdharm Colony',
  'Shahjahanabad',
  'Shahpura',
  'Shakti Nagar',
  'Shastri Nagar',
  'Shivaji Nagar',
  'Shyamla Hills',
  'Sindhi Colony',
  'Subhash Nagar',
  'TT Nagar',
  'Tulsi Nagar',
  'Vidya Nagar',
  'Vidisha Road',
  'Vijay Nagar',
  'VIP Road',
  'Wardhaman Nagar',
  'Yashoda Vihar',
  'Zone I MP Nagar',
  'Zone II MP Nagar',
  'Zone III MP Nagar',
];

function normalizeAreaValue(label: string) {
  return String(label)
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\./g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const run = async () => {
  try {
    await connectDB();

    // Seed cities
    for (const c of cities) {
      const cityOption = await Option.findOneAndUpdate(
        { type: CITY_TYPE, value: c.value, parent: null },
        {
          $set: {
            label: c.label,
            sortOrder: c.sortOrder,
            isActive: true,
            metadata: c.metadata || {},
          },
          $setOnInsert: {
            type: CITY_TYPE,
            value: c.value,
            parent: null,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`Upserted city option: ${c.value}`);

      // Seed areas for this city under type AREA_<CITYVALUE>
      const areaType = `AREA_${c.value}`;
      await Option.deleteMany({ type: areaType });

      const labels = c.value === 'BHOPAL' ? bhopalAreas : indoreAreas;
      const usedValues = new Set<string>();

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        let value = normalizeAreaValue(label);
        if (!value) value = `AREA_${i + 1}`;
        if (usedValues.has(value)) {
          let n = 2;
          while (usedValues.has(`${value}_${n}`)) n += 1;
          value = `${value}_${n}`;
        }
        usedValues.add(value);

        await Option.create({
          type: areaType,
          label,
          value,
          parent: cityOption._id,
          sortOrder: i + 1,
          isActive: true,
        });
      }

      console.log(`Seeded areas: ${areaType} (${labels.length})`);
    }

    console.log('City and area options seeding completed.');
  } catch (err) {
    console.error('Error seeding city/area options', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

run();
