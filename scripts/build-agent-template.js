/**
 * Build Agent Template
 * 
 * Pre-builds the agent files into a ZIP template during deployment.
 * This avoids copying source files during runtime (which may not exist in Vercel).
 * 
 * Runs during: npm run build (prebuild step)
 * Output: public/agent-template.zip
 * 
 * Note: All batch files and templates are read from src/modules-installer/template/dev/
 *       modules-agents and modules-client are injected from source during build
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Get project root (script runs from project root via npm)
const projectRoot = process.cwd();

async function buildAgentTemplate() {
  console.log('[prebuild] Building agent template...');
  
  // Ensure public directory exists
  const publicDir = path.join(projectRoot, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  const templatePath = path.join(publicDir, 'agent-template.zip');
  
  // Precheck: Delete existing agent-template.zip if it exists
  if (fs.existsSync(templatePath)) {
    console.log('[prebuild] Found existing agent-template.zip, deleting it...');
    try {
      fs.unlinkSync(templatePath);
      console.log('[prebuild] ✓ Old agent-template.zip deleted');
    } catch (error) {
      console.warn('[prebuild] Warning: Could not delete old agent-template.zip:', error.message);
      // Continue anyway - the new ZIP will overwrite it
    }
  }
  
  const zip = new AdmZip();
  
  // Source directories (will be injected during build)
  const modulesClientDir = path.join(projectRoot, 'src', 'modules-client');
  const modulesAgentsDir = path.join(projectRoot, 'src', 'modules-agents');
  
  console.log('[prebuild] Source directories:');
  console.log(`  - modules-client: ${modulesClientDir}`);
  console.log(`  - modules-agents: ${modulesAgentsDir}`);
  
  // Check if source directories exist
  if (!fs.existsSync(modulesClientDir)) {
    throw new Error(`modules-client directory not found: ${modulesClientDir}`);
  }
  if (!fs.existsSync(modulesAgentsDir)) {
    throw new Error(`modules-agents directory not found: ${modulesAgentsDir}`);
  }
  
  // Template directory (dev template for developer ZIP)
  const templateDir = path.join(projectRoot, 'src', 'modules-installer', 'template', 'dev');
  
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }
  
  console.log('[prebuild] Template directory:', templateDir);
  
  // Step 1: Add modules from source (injected during build)
  console.log('[prebuild] [1/4] Adding modules from source...');
  zip.addLocalFolder(modulesClientDir, 'agents/modules-client');
  zip.addLocalFolder(modulesAgentsDir, 'agents/modules-agents');
  console.log('[prebuild]   ✓ modules-client and modules-agents added');
  
  // Step 2: Add template files from template/dev/
  console.log('[prebuild] [2/4] Reading template files from template/dev/...');
  
  // Read batch files and other template files
  const templateFiles = [
    { src: 'start_agent.bat', dest: 'agents/start_agent.bat' },
    { src: 'package.json', dest: 'agents/package.json' },
    { src: 'README.txt', dest: 'agents/README.txt' },
    { src: 'script/check.bat', dest: 'agents/script/check.bat' },
    { src: 'script/setup_agents.bat', dest: 'agents/script/setup_agents.bat' },
  ];
  
  // Optional: download_deps.bat (for backward compatibility)
  const downloadDepsPath = path.join(templateDir, 'script', 'download_deps.bat');
  if (fs.existsSync(downloadDepsPath)) {
    templateFiles.push({ src: 'script/download_deps.bat', dest: 'agents/script/download_deps.bat' });
  }
  
  for (const file of templateFiles) {
    const srcPath = path.join(templateDir, file.src);
    if (fs.existsSync(srcPath)) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      zip.addFile(file.dest, Buffer.from(content, 'utf-8'));
      console.log(`[prebuild]   ✓ ${file.src} added (${content.length} bytes)`);
    } else {
      console.warn(`[prebuild]   ⚠ Warning: ${file.src} not found in template, skipping`);
    }
  }
  
  // Step 3: Create placeholder .env (will be replaced with custom one during build)
  console.log('[prebuild] [3/4] Creating placeholder .env...');
  const envPlaceholder = `# ABCD Tools Client Configuration
# This file will be replaced with custom configuration during build
# DO NOT share this file with anyone!
`;
  zip.addFile('agents/.env', Buffer.from(envPlaceholder, 'utf-8'));
  console.log('[prebuild]   ✓ .env placeholder added');
  
  // Step 4: Create empty logs directory
  console.log('[prebuild] [4/4] Creating logs directory...');
  zip.addFile('agents/logs/.gitkeep', Buffer.from('', 'utf-8'));
  console.log('[prebuild]   ✓ logs directory created');
  
  // Write ZIP file
  console.log('[prebuild] Writing ZIP archive...');
  zip.writeZip(templatePath);
  
  // Get file size
  const stats = fs.statSync(templatePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`[prebuild] ✅ Agent template created: ${templatePath} (${sizeMB} MB)`);
}

// Run if executed directly
if (require.main === module) {
  buildAgentTemplate()
    .then(() => {
      console.log('[prebuild] ✅ Build complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[prebuild] ❌ Build failed:', error.message);
      process.exit(1);
    });
}

module.exports = { buildAgentTemplate };
