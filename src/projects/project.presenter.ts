import { Participant, Project, Topic } from '@prisma/client';

import { Audience } from '../common/audience';
import { ProjectAnonymousDto, ProjectHumanDto } from '../common/dto';
import { serializeParticipant } from '../participants/participant.presenter';
import { serializeTopic } from '../topics/topic.presenter';

type ProjectWithRelations = Project & {
  participants?: Participant[];
  topics?: Topic[];
};

export function serializeProject(
  project: ProjectWithRelations,
  audience: Audience,
): ProjectHumanDto | ProjectAnonymousDto {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    topics: project.topics?.map((topic) =>
      serializeTopic(topic, audience, project.participants),
    ),
    participants: project.participants?.map((participant) =>
      serializeParticipant(participant, audience),
    ),
  } as ProjectHumanDto | ProjectAnonymousDto;
}
