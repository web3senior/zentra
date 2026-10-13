// Any page part can ask the header to open its sign-in dialog (components/Profile listens)
export const SIGN_IN_EVENT = 'zentra:sign-in'
export const openSignIn = () => window.dispatchEvent(new Event(SIGN_IN_EVENT))
