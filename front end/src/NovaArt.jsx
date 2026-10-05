/** The approved workspace artwork; behavior belongs to WorkspaceNova. */
export default function NovaArt() {
  return (
    <span className="wn-model" aria-hidden="true">
      <span className="wn-direction">
        <span className="wn-robot">
          <span className="wn-antenna"><span /></span>
          <span className="wn-ear wn-ear-left" />
          <span className="wn-ear wn-ear-right" />
          <span className="wn-head">
            <span className="wn-screen">
              <span className="wn-brow wn-brow-left" />
              <span className="wn-brow wn-brow-right" />
              <span className="wn-eye wn-eye-left"><span className="wn-pupil" /></span>
              <span className="wn-eye wn-eye-right"><span className="wn-pupil" /></span>
              <span className="wn-cheek wn-cheek-left" />
              <span className="wn-cheek wn-cheek-right" />
              <span className="wn-smile" />
            </span>
          </span>
          <span className="wn-torso"><span>✦</span></span>
          <span className="wn-arm wn-arm-left"><span /></span>
          <span className="wn-arm wn-arm-right"><span /></span>
          <span className="wn-leg wn-leg-left" />
          <span className="wn-leg wn-leg-right" />
        </span>
        <span className="wn-back">
          <span className="wn-antenna"><span /></span>
          <span className="wn-ear wn-ear-left" />
          <span className="wn-ear wn-ear-right" />
          <span className="wn-head"><span className="wn-rear-panel" /></span>
          <span className="wn-torso"><span className="wn-rear-light" /></span>
          <span className="wn-arm wn-arm-left"><span /></span>
          <span className="wn-arm wn-arm-right"><span /></span>
          <span className="wn-leg wn-leg-left" />
          <span className="wn-leg wn-leg-right" />
        </span>
      </span>
    </span>
  );
}
