# BikeTrack
This app allows you to create a biker (cyclist) group and track every person's location, speed, and other important info.

At a glance, you can see how far apart everyone is and if you haven't lost anybody, eliminating the need to constantly look over your shoulder.

It also has a menu for quick communication, which has a few preset buttons for important events. Everyone is notified when one of these buttons is pressed, with the event spoken out loud using TTS.

### Full feature list
* GPS tracking
* Map with pins for individual members and positions of alerts
* Background location tracking
* Quick comms with TTS
* Group joining via QR or 6-digit code
* Automatic alerts when someone is too far behind/connection lost

## Setup
Download & run the APK of the latest release, which can be found in the Releases section of this repository.

Once run, the app asks for necessary permissions.

## Development
Contributions are welcome! Clone this repository and run `npm i` to download the required dependencies. You will need to provide your own `google-services.json` file, this project uses the Firebase Realtime database.

### Stack
* React Native w/ TypeScript (currently only focusing on Android)
* Firebase (Auth, Realtime Database)
* MapLibre GL
* EAS

## AI Disclaimer
AI was used during the development of this project.

Most of the code is AI generated and vibecoded. You can check the human-written prompt in the `pre-plan.txt` file, located at the root of this repository.

I made this project with heavy reliance on AI because I needed to expedite its development, and I also wanted to try the capabilities of a newly released model at that time -- Claude Fable 5, which was used for most of the project.