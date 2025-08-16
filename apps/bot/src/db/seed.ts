import { db, client } from './index';
// import { pieceTypes, gameStatusTypes } from './schema';

async function main() {
  console.log('Seeding database...');
  
  try {
    
    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();