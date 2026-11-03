import { CalculateMetadataFunction, Composition } from "remotion";
import { Video } from "./Video";
import { FPS, VideoProps, placeholder } from "./types";

const metadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
});

export const RemotionRoot = () => (
  <>
    <Composition id="Vertical" component={Video} defaultProps={placeholder} calculateMetadata={metadata}
      durationInFrames={placeholder.durationInFrames} fps={FPS} width={1080} height={1920} />
    <Composition id="Landscape" component={Video} defaultProps={placeholder} calculateMetadata={metadata}
      durationInFrames={placeholder.durationInFrames} fps={FPS} width={1920} height={1080} />
  </>
);
