import { Composition, registerRoot } from "remotion";
import { ProjectVideo } from "./ProjectVideo";
import { projects } from "./projects";
import { FPS, HEIGHT, WIDTH, totalFrames } from "./theme";

const Root = () => (
  <>
    {projects.map((project) => (
      <Composition
        key={project.slug}
        id={project.slug}
        component={ProjectVideo}
        defaultProps={{ project }}
        durationInFrames={totalFrames(project)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    ))}
  </>
);

registerRoot(Root);
