import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // API Routes
  app.post('/api/payroll/parse-csv', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const records = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // Basic validation and mapping
      const employees = records.map((row: any, index: number) => {
        const cpf = row.cpf?.replace(/\D/g, '');
        if (!cpf || cpf.length !== 11) {
          throw new Error(`Linha ${index + 1}: CPF inválido (${row.cpf || 'vazio'})`);
        }
        const salaryStr = row.salary || row.salario || row.baseSalary;
        const salary = parseFloat(String(salaryStr).replace(',', '.'));
        if (isNaN(salary)) {
          throw new Error(`Linha ${index + 1}: Salário inválido (${salaryStr || 'vazio'})`);
        }

        return {
          name: row.name || row.nome,
          cpf,
          baseSalary: salary,
          dependents: parseInt(row.dependents || row.dependentes || '0', 10),
          bankCode: row.bankCode || row.banco,
          bankAgency: row.bankAgency || row.agencia,
          bankAccount: row.bankAccount || row.conta,
        };
      });

      res.json({ employees });
    } catch (error: any) {
      console.error('CSV Parse Error:', error);
      res.status(422).json({ error: error.message });
    }
  });

  // Error handler for API routes
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal Server Error' 
    });
  });

  // 404 handler for API routes - prevent HTML fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
