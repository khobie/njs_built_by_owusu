import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Minimal data for the areas mentioned in errors
const AREAS = [
  'OSABENE MILE 50',
  'ADWESO ESTATE',
  'ADWESO TOWN',
  'TWO STREAMS',
  'NYEREDE NORTH',
  'NYEREDE SOUTH',
  'RESIDENTIAL AREA',
  'OGUAA',
  'ASUOFIRISO',
  'ANGLICAN',
  'ADONTUA',
  'OHEMAA PARK',
  'SCHOOL TOWN',
  'OLD ESTATE WEST',
  'OLD ESTATE EAST',
  'TANOSO',
  'NSUKWAOSO ABOTANSO',
  'NSUKWAOSO',
  'RAILWAY STATION',
  'DEBRAKROM',
  'AKWAASU ASEBI',
  'CENTRAL MARKET AREA',
  'SOCIAL WELFARE',
  'KANTUDU',
  'CENTRAL HOSPITAL',
  'ANLO TOWN SOUTH',
  'ANLO TOWN NORTH',
  'KLU TOWN',
  'COMMUNITY A & B',
  'COMMUNITY C',
  'COMMUNITY D',
  'ADA',
  'NYAMEKROM',
  'SEMPOAMIENSA',
];

const STATIONS = [
  // OSABENE MILE 50
  { code: 'E050101', name: 'MILE 50 M. A. PRIMARY 1', area: 'OSABENE MILE 50' },
  { code: 'E050102', name: 'MILE 50 M. A. PRIMARY 2', area: 'OSABENE MILE 50' },
  { code: 'E050103', name: 'MILE 50 M. A. JHS', area: 'OSABENE MILE 50' },
  // ADWESO ESTATE
  { code: 'E050201', name: 'HOUSING CORPORATION OFFICE ADWESO', area: 'ADWESO ESTATE' },
  { code: 'E050202', name: 'ST DOMINIC PRIMARY SCHOOL ADWESO 1', area: 'ADWESO ESTATE' },
  // TWO STREAMS
  { code: 'E050401', name: 'METHODIST CHAPEL', area: 'TWO STREAMS' },
  // TANOSO
  { code: 'E051601', name: 'TANOSO SOUTH 1', area: 'TANOSO' },
  // OLD ESTATE EAST
  { code: 'E051501', name: 'HOUSING CORP OFFICE OLD ESTATE 1', area: 'OLD ESTATE EAST' },
  // Add more as needed...
];

async function main() {
  console.log('🌱 Starting simple seed...');

  // Create electoral areas
  for (const areaName of AREAS) {
    const code = areaName.toUpperCase().replace(/\s+/g, '-');
    try {
      await prisma.electoralArea.upsert({
        where: { code },
        update: {},
        create: { name: areaName, code },
      });
      console.log(`  ✓ Created area: ${areaName}`);
    } catch (err) {
      console.log(`  ⊘ Area exists: ${areaName}`);
    }
  }

  // Create polling stations
  for (const station of STATIONS) {
    const area = await prisma.electoralArea.findFirst({
      where: { name: station.area }
    });
    if (!area) {
      console.log(`  ⚠ Area not found: ${station.area}`);
      continue;
    }
    
    try {
      await prisma.pollingStation.upsert({
        where: { code: station.code },
        update: {},
        create: {
          code: station.code,
          name: station.name,
          electoralAreaId: area.id,
        },
      });
      console.log(`  ✓ Created station: ${station.code} - ${station.name}`);
    } catch (err) {
      console.log(`  ⊘ Station exists: ${station.code}`);
    }
  }

  console.log('✅ Simple seed completed!');
  console.log(`   - ${await prisma.electoralArea.count()} electoral areas`);
  console.log(`   - ${await prisma.pollingStation.count()} polling stations`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
