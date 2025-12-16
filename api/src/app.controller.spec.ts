import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "API up"', () => {
      expect(appController.getRoot()).toBe('API up');
    });
  });

  describe('hello', () => {
    it('should return greeting message', () => {
      expect(appController.getHello()).toBe('Hello from NestJS.');
    });
  });
});
