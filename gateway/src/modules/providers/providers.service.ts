import {
  Injectable, NotFoundException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Provider } from './entities/provider.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);
  private readonly encKey: Buffer;

  constructor(
    @InjectRepository(Provider)
    private readonly repo: Repository<Provider>,
    private readonly config: ConfigService,
  ) {
    const rawKey = this.config.get<string>('encryption.key') ?? 'default_dev_key_change_in_prod!!';
    // Derive a 32-byte key from the provided string
    this.encKey = scryptSync(rawKey, 'aios-salt', 32) as Buffer;
  }

  async findAll(): Promise<Provider[]> {
    return this.repo.find({ order: { priority: 'ASC' } });
  }

  async findOne(id: string): Promise<Provider> {
    const provider = await this.repo.findOneBy({ id });
    if (!provider) throw new NotFoundException(`Provider ${id} not found`);
    return provider;
  }

  async findByName(name: string): Promise<Provider | null> {
    return this.repo.findOneBy({ name });
  }

  async create(dto: CreateProviderDto): Promise<Provider> {
    const existing = await this.repo.findOneBy({ name: dto.name });
    if (existing) throw new ConflictException(`Provider "${dto.name}" already exists`);

    const provider = this.repo.create({
      name: dto.name,
      apiKeyEnc: dto.apiKey ? this.encrypt(dto.apiKey) : null,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 5,
      modelDefault: dto.modelDefault ?? null,
      costPer1k: dto.costPer1k ?? 0,
      rateLimit: dto.rateLimit ?? 1000,
      fallbackTo: dto.fallbackTo ?? null,
    });

    return this.repo.save(provider);
  }

  async update(id: string, dto: UpdateProviderDto): Promise<Provider> {
    const provider = await this.findOne(id);

    if (dto.apiKey !== undefined) {
      provider.apiKeyEnc = dto.apiKey ? this.encrypt(dto.apiKey) : null;
    }
    if (dto.enabled !== undefined) provider.enabled = dto.enabled;
    if (dto.priority !== undefined) provider.priority = dto.priority;
    if (dto.modelDefault !== undefined) provider.modelDefault = dto.modelDefault ?? null;
    if (dto.costPer1k !== undefined) provider.costPer1k = dto.costPer1k;
    if (dto.rateLimit !== undefined) provider.rateLimit = dto.rateLimit;
    if (dto.fallbackTo !== undefined) provider.fallbackTo = dto.fallbackTo ?? null;

    return this.repo.save(provider);
  }

  async remove(id: string): Promise<void> {
    const provider = await this.findOne(id);
    await this.repo.remove(provider);
  }

  /** Returns the decrypted API key for internal use by the AI Brain. */
  getDecryptedKey(provider: Provider): string | null {
    if (!provider.apiKeyEnc) return null;
    return this.decrypt(provider.apiKeyEnc);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, encHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', this.encKey, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
