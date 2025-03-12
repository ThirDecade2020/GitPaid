const { PrismaClient } = require('@prisma/client');

// Create a singleton instance of PrismaClient with logging enabled
let prisma;

try {
  prisma = new PrismaClient({
    log: ['query', 'error', 'warn'],
  });
  
  console.log('PrismaClient initialized successfully');
  
  // Test the connection
  prisma.$connect()
    .then(() => console.log('Database connection established'))
    .catch(e => console.error('Failed to connect to database:', e));
    
} catch (error) {
  console.error('Error initializing PrismaClient:', error);
  process.exit(1); // Exit if we can't initialize the database client
}

// Handle graceful shutdown
process.on('exit', () => {
  prisma.$disconnect()
    .then(() => console.log('Disconnected from database'))
    .catch(e => console.error('Error disconnecting from database:', e));
});

module.exports = prisma;
