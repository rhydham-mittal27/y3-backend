import dotenv from 'dotenv';
import https from 'https';
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

function areaLabel(i: number) {
  return `Area ${String(i).padStart(3, '0')}`;
}

function areaValue(i: number) {
  return `AREA_${String(i).padStart(3, '0')}`;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          fetchText(location).then(resolve).catch(reject);
          return;
        }
        if (status >= 400) {
          reject(new Error(`HTTP ${status} for ${url}`));
          res.resume();
          return;
        }
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function extractLocalitiesFromMagicBricks(html: string, cityName: 'Bhopal' | 'Indore') {
  const out: string[] = [];
  const seen = new Set<string>();

  const re = new RegExp(`>([^<]+),\\s*${cityName}<\\/a>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = String(m[1] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 250) break;
  }

  return out;
}

function extractLocalitiesFromMapsOfIndia(html: string) {
  const out: string[] = [];
  const seen = new Set<string>();

  // Example snippet:
  // <a href="/bhopal/localities/arera-colony.html">Arera Colony</a>
  // <a href="/indore/localities/ab-road.html">AB Road</a>
  const re = /<a\s+href="\/[a-z-]+\/localities\/[a-z0-9\-]+\.html"[^>]*>([^<]{2,80})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = String(m[1] || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 500) break;
  }

  return out;
}

async function getAreasForCity(city: 'Bhopal' | 'Indore') {
  const wantReal = String(process.env.SEED_REAL_AREAS || '').toLowerCase() === 'true';
  if (!wantReal) {
    console.log(`[seedCityAreaOptions] Using placeholder areas for ${city} (set SEED_REAL_AREAS=true to fetch real names)`);
    return Array.from({ length: 100 }, (_, idx) => ({ label: areaLabel(idx + 1), value: areaValue(idx + 1) }));
  }

  try {
    const mapsUrl = city === 'Bhopal'
      ? 'https://www.mapsofindia.com/bhopal/localities/'
      : 'https://www.mapsofindia.com/indore/localities/';

    const mapsHtml = await fetchText(mapsUrl);
    let names = extractLocalitiesFromMapsOfIndia(mapsHtml);
    console.log(`[seedCityAreaOptions] Extracted ${names.length} locality names for ${city} from ${mapsUrl}`);

    // Fallback: MagicBricks (often returns a short list due to dynamic/anti-bot)
    if (names.length < 100) {
      const mbUrl = city === 'Bhopal' ? 'https://www.magicbricks.com/localities-in-bhopal' : 'https://www.magicbricks.com/localities-in-indore';
      const mbHtml = await fetchText(mbUrl);
      const mbNames = extractLocalitiesFromMagicBricks(mbHtml, city);
      console.log(`[seedCityAreaOptions] Extracted ${mbNames.length} locality names for ${city} from ${mbUrl}`);
      const seen = new Set(names.map((n) => n.toLowerCase()));
      for (const n of mbNames) {
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(n);
        if (names.length >= 100) break;
      }
    }

    if (names.length < 100) {
      console.warn(`[seedCityAreaOptions] Only found ${names.length} real locality names for ${city}. Filling remainder with placeholders.`);
    }

    // IMPORTANT: keep stable values AREA_001..AREA_100 so existing placeholder options get updated
    // instead of creating new documents with slugified values.
    const finalLabels: string[] = [];
    for (let i = 0; i < 100; i++) {
      finalLabels.push(names[i] || areaLabel(i + 1));
    }
    return finalLabels.map((label, idx) => ({ label, value: areaValue(idx + 1) }));
  } catch (e) {
    console.warn(`[seedCityAreaOptions] Failed to fetch real areas for ${city}. Falling back to placeholders.`, e);
    return Array.from({ length: 100 }, (_, idx) => ({ label: areaLabel(idx + 1), value: areaValue(idx + 1) }));
  }
}

const run = async () => {
  try {
    await connectDB();

    const bhopalAreas = await getAreasForCity('Bhopal');
    const indoreAreas = await getAreasForCity('Indore');

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
      const areas = c.value === 'BHOPAL' ? bhopalAreas : indoreAreas;
      for (let i = 0; i < areas.length; i++) {
        const value = areas[i].value;
        const label = areas[i].label;
        await Option.findOneAndUpdate(
          { type: areaType, value, parent: cityOption._id },
          {
            $set: {
              label,
              sortOrder: i + 1,
              isActive: true,
              parent: cityOption._id,
            },
            $setOnInsert: {
              type: areaType,
              value,
            },
          },
          { upsert: true, new: true }
        );
      }

      console.log(`Upserted areas: ${areaType} (100)`);
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
