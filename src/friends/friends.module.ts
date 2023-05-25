import { Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { AppService } from 'src/app.service';
import { SseModule } from 'src/sse/sse.module';
import { DmsModule } from 'src/dms/dms.module';

@Module({
  imports: [SseModule, DmsModule],
  providers: [FriendsService, AppService],
  controllers: [FriendsController],
  exports: [FriendsService]
})
export class FriendsModule {}
