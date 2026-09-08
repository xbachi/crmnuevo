import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { logger } from '../utils/logger.js';

class StaticServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number = 0;
  private fileMap = new Map<string, string>();

  async start(): Promise<void> {
    if (this.server) return;

    this.server = createServer(this.handleRequest.bind(this));

    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        this.port = typeof addr === 'object' && addr ? addr.port : 0;
        logger.info(`Static server started on port ${this.port}`);
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '';
    const match = url.match(/^\/files\/(.+)$/);

    if (!match) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const hash = match[1];
    const filePath = this.fileMap.get(hash);

    if (!filePath) {
      res.writeHead(404);
      res.end('File not registered');
      return;
    }

    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end('Error reading file');
    }
  }

  async serveFile(filePath: string, hash: string): Promise<string> {
    await this.start();
    this.fileMap.set(hash, filePath);
    return `http://127.0.0.1:${this.port}/files/${hash}`;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const staticServer = new StaticServer();
