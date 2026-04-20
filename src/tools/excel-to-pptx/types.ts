// Tipos compartidos entre la vista React y el comando Rust / script Python
// de la herramienta Excel → PowerPoint (Fase 3).

export interface ExcelToPptxInput {
  excelPath: string;
  outputPath?: string;
}

export interface ExcelToPptxResult {
  pptxPath: string;
  slidesGenerated: number;
}
