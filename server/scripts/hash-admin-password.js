const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password || password.length < 14) {
  console.error('Provide an admin password of at least 14 characters.');
  console.error('Usage: npm run hash:admin -- "your-long-admin-password"');
  process.exit(1);
}

bcrypt.hash(password, 12)
  .then(hash => console.log(hash))
  .catch(error => {
    console.error('Unable to generate password hash:', error.message);
    process.exit(1);
  });
