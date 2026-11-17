import { openDatabaseAsync } from 'expo-sqlite';
import {
  type PropsWithChildren,
  type ReactNode,
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';

import { AttemptsRepository } from './attempts-repository';
import { BackupService } from './backup';
import { ChangeFeed } from './changes';
import { createExpoDriver } from './expo-driver';
import { LibraryRepository } from './library-repository';
import { FocusRepository } from './focus-repository';
import { JobsRepository } from './jobs-repository';
import { migrate } from './migrations';
import { ProvidersRepository } from './providers-repository';
import { ReviewsRepository } from './reviews-repository';
import { seedSamples } from './seed';
import { SettingsRepository } from './settings-repository';

const DATABASE_NAME = 'anki.db';

export type AppData = {
  library: LibraryRepository;
  attempts: AttemptsRepository;
  backups: BackupService;
  providers: ProvidersRepository;
  jobs: JobsRepository;
  focus: FocusRepository;
  reviews: ReviewsRepository;
  settings: SettingsRepository;
  changes: ChangeFeed;
};

const DataContext = createContext<AppData | null>(null);

async function openAppData(): Promise<AppData> {
  const database = await openDatabaseAsync(DATABASE_NAME);
  // Connection settings cannot be changed inside a transaction, so they come first.
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const driver = createExpoDriver(database);
  await migrate(driver);

  const changes = new ChangeFeed();
  const library = new LibraryRepository(driver, changes);
  const settings = new SettingsRepository(driver, changes);
  const providers = new ProvidersRepository(driver, changes);
  await seedSamples(library, settings);
  return {
    library,
    attempts: new AttemptsRepository(driver, changes),
    backups: new BackupService(driver, library, providers, changes),
    providers,
    jobs: new JobsRepository(driver, changes),
    focus: new FocusRepository(driver, changes),
    reviews: new ReviewsRepository(driver, changes),
    settings,
    changes,
  };
}

// One database connection for the life of the app, even if the provider remounts.
let opening: Promise<AppData> | null = null;

type Props = PropsWithChildren<{
  onReady?: () => void;
  renderError: (error: Error) => ReactNode;
}>;

/** Opens the database, brings it up to date and hands the repositories to the app. */
export function DataProvider({ children, onReady, renderError }: Props) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const ready = useEffectEvent(() => onReady?.());

  useEffect(() => {
    let active = true;
    opening ??= openAppData();
    opening
      .then((opened) => {
        if (active) setData(opened);
      })
      .catch((cause: unknown) => {
        opening = null;
        if (active) setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (active) ready();
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return renderError(error);
  if (!data) return null;
  return <DataContext value={data}>{children}</DataContext>;
}

export function useData(): AppData {
  const data = use(DataContext);
  if (!data) throw new Error('useData must be used inside DataProvider.');
  return data;
}

type QueryState<T> = { data: T | undefined; error: Error | null; loading: boolean };

/**
 * Reads from the database and reads again after any write.
 * `key` identifies the inputs of `load`. Change it when they change.
 */
export function useQuery<T>(key: string, load: (data: AppData) => Promise<T>): QueryState<T> {
  const appData = useData();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });
  const run = useEffectEvent(() => load(appData));

  useEffect(() => {
    let active = true;
    const refresh = () => {
      run()
        .then((result) => {
          if (active) setState({ data: result, error: null, loading: false });
        })
        .catch((cause: unknown) => {
          if (active) {
            setState((previous) => ({
              data: previous.data,
              error: cause instanceof Error ? cause : new Error(String(cause)),
              loading: false,
            }));
          }
        });
    };
    refresh();
    const unsubscribe = appData.changes.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [key, appData]);

  return state;
}
