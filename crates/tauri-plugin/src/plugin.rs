use std::path::PathBuf;

use tauri::{
    Manager, Runtime,
    plugin::{self, TauriPlugin},
};

use crate::{commands, soundfont::Soundfonts};

/// The plugin's name: its commands are `plugin:donizetti|<command>` and its permissions `donizetti:…`.
const NAME: &str = "donizetti";

/// Where the app ships the soundfont, if it does.
#[derive(Debug)]
enum Bundled {
    /// This folder.
    Folder(PathBuf),
    /// This folder inside the app's resources (`resource_dir()`), found when the app starts.
    Resource(PathBuf),
}

/// Sets up the plugin. The soundfont lives in the app's data folder (`app_data_dir()/soundfonts`)
/// unless [`Builder::soundfont_dir`] names another; an app that ships the soundfont names where with
/// [`Builder::bundled_soundfont_resource`] or [`Builder::bundled_soundfont_dir`].
#[derive(Debug, Default)]
pub struct Builder {
    soundfont_dir: Option<PathBuf>,
    bundled: Option<Bundled>,
}

impl Builder {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The folder the soundfont is downloaded to and read from (created when first needed).
    #[must_use]
    pub fn soundfont_dir(mut self, folder: impl Into<PathBuf>) -> Self {
        self.soundfont_dir = Some(folder.into());
        self
    }

    /// The folder the app ships the soundfont in: the pinned file (`MuseScore_General.sf3`) with its
    /// notice (`MuseScore_General.sf3.LICENSE.md`). Found there, it is played before any download,
    /// installing it does nothing and removing it leaves it.
    #[must_use]
    pub fn bundled_soundfont_dir(mut self, folder: impl Into<PathBuf>) -> Self {
        self.bundled = Some(Bundled::Folder(folder.into()));
        self
    }

    /// As [`Builder::bundled_soundfont_dir`], for a folder inside the app's resources
    /// (`bundle.resources` in `tauri.conf.json`), `relative` to `resource_dir()`, which is known only
    /// when the app starts: `.bundled_soundfont_resource("soundfonts")`.
    #[must_use]
    pub fn bundled_soundfont_resource(mut self, relative: impl Into<PathBuf>) -> Self {
        self.bundled = Some(Bundled::Resource(relative.into()));
        self
    }

    #[must_use]
    pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
        plugin::Builder::new(NAME)
            .invoke_handler(tauri::generate_handler![
                commands::read_score,
                commands::write_score,
                commands::soundfont_status,
                commands::install_soundfont,
                commands::cancel_soundfont_install,
                commands::read_soundfont,
                commands::remove_soundfont,
                commands::export_pdf,
                commands::write_export,
            ])
            .setup(move |app, _api| {
                let folder = match self.soundfont_dir {
                    Some(folder) => folder,
                    None => app.path().app_data_dir()?.join("soundfonts"),
                };
                let mut soundfonts = Soundfonts::new(folder);
                if let Some(bundled) = self.bundled {
                    let folder = match bundled {
                        Bundled::Folder(folder) => folder,
                        Bundled::Resource(relative) => app.path().resource_dir()?.join(relative),
                    };
                    soundfonts = soundfonts.with_bundled(folder);
                }
                app.manage(soundfonts);
                Ok(())
            })
            .build()
    }
}

/// The plugin with its defaults: `.plugin(tauri_plugin_donizetti::init())`.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new().build()
}
