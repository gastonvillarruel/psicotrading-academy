import fs from 'fs';
import path from 'path';

export function getGlobalCampusVirtualImage(): string {
  try {
    const filePath = path.join(process.cwd(), 'src', 'config', 'globalCampusVirtual.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data.image || '';
    }
  } catch (error) {
    console.error('Error reading globalCampusVirtual.json:', error);
  }
  return '';
}

export function saveGlobalCampusVirtualImage(image: string): void {
  try {
    const filePath = path.join(process.cwd(), 'src', 'config', 'globalCampusVirtual.json');
    fs.writeFileSync(filePath, JSON.stringify({ image }, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing globalCampusVirtual.json:', error);
  }
}

export function applyGlobalCampusVirtual(descriptionSections: any): any {
  if (!descriptionSections) return descriptionSections;
  
  try {
    const isString = typeof descriptionSections === 'string';
    const sections = isString
      ? JSON.parse(descriptionSections)
      : JSON.parse(JSON.stringify(descriptionSections)); // deep clone to avoid mutating parameters in-place unexpectedly
      
    if (Array.isArray(sections)) {
      const globalImage = getGlobalCampusVirtualImage();
      if (globalImage) {
        let modified = false;
        sections.forEach((section: any) => {
          if (section.type === 'campusVirtual' && section.data) {
            section.data.image = globalImage;
            modified = true;
          }
        });
        if (modified) {
          return isString ? JSON.stringify(sections) : sections;
        }
      }
    }
  } catch (error) {
    console.error('Error applying global campus virtual:', error);
  }
  
  return descriptionSections;
}
