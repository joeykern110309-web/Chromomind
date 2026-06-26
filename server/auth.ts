import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      displayName: string | null;
      avatar: string | null;
    }
  }
}

export const GOOGLE_CONFIGURED = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user ?? false);
  } catch (e) {
    done(e, false);
  }
});

if (GOOGLE_CONFIGURED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: "/api/auth/google/callback", // relative — overridden per-request at runtime
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = `google_${profile.id}`;
          let user = await storage.getUser(googleId);
          if (!user) {
            user = await storage.createUser({
              id: googleId,
              username: profile.emails?.[0]?.value ?? profile.displayName,
              password: "",
              displayName: profile.displayName,
              avatar: profile.photos?.[0]?.value ?? null,
            } as any);
          }
          return done(null, user as Express.User);
        } catch (e) {
          return done(e as Error);
        }
      }
    )
  );
}

export { passport };
