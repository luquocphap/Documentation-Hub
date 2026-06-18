import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspace/schemas/workspaces.schema';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import {
  ActionCategory,
  ActionCategorySchema,
} from './schemas/action_categories.schema';
import { Action, ActionSchema } from './schemas/actions.schema';
import { Activity, ActivitySchema } from './schemas/activities.schema';
import { SocketModule } from 'src/modules-system/socket/socket.module';

@Module({
  imports: [
    SocketModule,
    
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: Action.name, schema: ActionSchema },
      { name: ActionCategory.name, schema: ActionCategorySchema },
      { name: User.name, schema: UserSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
