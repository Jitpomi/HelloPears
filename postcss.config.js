
import tailwindcss from 'tailwindcss'; // Import Tailwind CSS
import autoprefixer from 'autoprefixer'; // Import Autoprefixer

export default {
  plugins: [
    tailwindcss('./tailwind.config.js'), // Path to your Tailwind config
    autoprefixer({}), // Empty options object for autoprefixer
  ],
};
