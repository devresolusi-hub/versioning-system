import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pagesDir = path.join(__dirname, '../pages');

// Files that should export React components (not API routes)
const pageFiles = [
  'posts/create.js',
  'posts/history.js',
  'posts/[jobId].js',
  'settings/profile.js',
  'settings/agents.js',
  'settings/install.js',
  'admin/micro-actions.js',
  'admin/workflows.js',
];

// Fix page files to export React components
pageFiles.forEach((file) => {
  const filePath = path.join(pagesDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.trim().startsWith('//')) {
      const componentName = path.basename(file, '.js')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      
      const newContent = `export default function ${componentName}() {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}
`;
      fs.writeFileSync(filePath, newContent);
      console.log(`✓ Fixed ${file}`);
    }
  }
});

// Fix API routes to export handler functions
function fixApiRoutes(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixApiRoutes(filePath);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.trim().startsWith('//')) {
        const routeName = path.basename(file, '.js');
        const newContent = `export default async function handler(req, res) {
  // TODO: Implement ${routeName} handler
  res.status(200).json({ message: '${routeName} endpoint' });
}
`;
        fs.writeFileSync(filePath, newContent);
        console.log(`✓ Fixed API route ${path.relative(pagesDir, filePath)}`);
      }
    }
  });
}

// Fix all API routes
const apiDir = path.join(pagesDir, 'api');
if (fs.existsSync(apiDir)) {
  fixApiRoutes(apiDir);
}

console.log('✓ All pages fixed!');

