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
    metadata: { whatsappLink: 'https://chat.whatsapp.com/BhopalOfflineTutors' } 
  },
  { 
    label: 'Indore', 
    value: 'INDORE', 
    sortOrder: 2, 
    metadata: { whatsappLink: 'https://chat.whatsapp.com/IndoreOfflineTutors' } 
  },
];

// Areas per city, keyed by the CITY option value
const cityAreas: Record<string, { label: string; value: string; sortOrder: number }[]> = {
  BHOPAL: [
    { label: 'Arera Colony', value: 'ARERA_COLONY', sortOrder: 1 },
    { label: 'MP Nagar', value: 'MP_NAGAR', sortOrder: 2 },
    { label: 'Kolar Road', value: 'KOLAR_ROAD', sortOrder: 3 },
    { label: 'Hoshangabad Road', value: 'HOSHANGABAD_ROAD', sortOrder: 4 },
    { label: 'Berasia Road', value: 'BERASIA_ROAD', sortOrder: 5 },
    { label: 'Ayodhya Bypass', value: 'AYODHYA_BYPASS', sortOrder: 6 },
    { label: 'Bairagarh', value: 'BAIRAGARH', sortOrder: 7 },
    { label: 'Katara Hills', value: 'KATARA_HILLS', sortOrder: 8 },
    { label: 'Shahpura', value: 'SHAHPURA', sortOrder: 9 },
    { label: 'Jahangirabad', value: 'JAHANGIRABAD', sortOrder: 10 },
    { label: 'Govindpura', value: 'GOVINDPURA', sortOrder: 11 },
    { label: 'Ashoka Garden', value: 'ASHOKA_GARDEN', sortOrder: 12 },
    { label: 'Bawadiya Kalan', value: 'BAWADIYA_KALAN', sortOrder: 13 },
    { label: 'Raisen Road', value: 'RAISEN_ROAD', sortOrder: 14 },
  ],
  INDORE: [
    { label: 'Vijay Nagar', value: 'VIJAY_NAGAR', sortOrder: 1 },
    { label: 'Rajwada', value: 'RAJWADA', sortOrder: 2 },
  ],
};

const run = async () => {
  try {
    await connectDB();

    // Clear existing CITY and AREA_* options so we start fresh
    await Option.deleteMany({ type: CITY_TYPE });
    await Option.deleteMany({ type: { $regex: /^AREA_/ } });

    // Seed cities
    for (const c of cities) {
      let cityOption = await Option.findOne({ type: CITY_TYPE, value: c.value });
      if (!cityOption) {
        cityOption = await Option.create({
          type: CITY_TYPE,
          label: c.label,
          value: c.value,
          sortOrder: c.sortOrder,
          isActive: true,
          metadata: c.metadata || {},
        });
        console.log(`Created city option: ${c.value}`);
      } else {
        console.log(`City option already exists: ${c.value}`);
      }

      // Seed areas for this city under type AREA_<CITYVALUE>
      const areaType = `AREA_${c.value}`;
      const areas = cityAreas[c.value] || [];
      for (const a of areas) {
        const existingArea = await Option.findOne({ type: areaType, value: a.value });
        if (existingArea) {
          // Update parent if missing
          if (!existingArea.parent) {
             existingArea.parent = cityOption._id;
             await existingArea.save();
          }
          console.log(`Area option already exists: ${areaType}:${a.value}`);
          continue;
        }
        await Option.create({
          type: areaType,
          label: a.label,
          value: a.value,
          parent: cityOption._id,
          sortOrder: a.sortOrder,
          isActive: true,
        });
        console.log(`Created area option: ${areaType}:${a.value}`);
      }
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
