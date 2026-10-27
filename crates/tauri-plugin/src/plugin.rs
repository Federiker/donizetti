use std::path::PathBuf;

use tauri::{
    Manager, Runtime,
    plugin::{self, TauriPlugin},
};

use crate::{commands, soundfont::Soundfonts};

/// The plugin's name: its commands are `plugin:donizetti|<command>` and its permissions `donizetti:…`.
const NAME: &str = "donizetti";

/// Sets up the plugin. The soundfont lives in the app's data folder (`app_data_dir()/soundfonts`)
/// unless [`Builder::soundfont_dir`] names another.
#[derive(Debug, Default)]
pub struct Builder {
    soundfont_dir: Option<PathBuf>,
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
            ])
            .setup(move |app, _api| {
                let folder = match self.soundfont_dir {
                    Some(folder) => folder,
                    None => app.path().app_data_dir()?.join("soundfonts"),
                };
                app.manage(Soundfonts::new(folder));
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
