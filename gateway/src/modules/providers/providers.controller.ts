import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Provider } from './entities/provider.entity';

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly service: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'List all AI providers ordered by priority' })
  @ApiResponse({ status: 200, type: [Provider] })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single provider' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new AI provider' })
  @ApiResponse({ status: 201, type: Provider })
  create(@Body() dto: CreateProviderDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update provider settings or rotate API key' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a provider' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
