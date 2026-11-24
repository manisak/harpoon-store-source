Name:       harbour-hstoreclient
Summary:    Harpoon Store client - browse and install SailfishOS apps
Version:    0.1.0
Release:    1
Group:      Applications/Internet
License:    MIT
URL:        https://harpoon-store.manisak.com
BuildArch:  noarch
Requires:   sailfish-qml
%{!?qtc_qmake5:%define qtc_qmake5 %qmake5}
%description
Browse the Harpoon Store community app list and install apps with a single
tap: this client opens Harpoon pre-filled with the app's repository URL.
%prep
%setup -q
%build
%install
mkdir -p %{buildroot}%{_datadir}/%{name}/qml/pages
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/86x86/apps
cp $HOME/rpmbuild/SOURCES/%{name}.qml %{buildroot}%{_datadir}/%{name}/qml/%{name}.qml
cp $HOME/rpmbuild/SOURCES/FirstPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/FirstPage.qml
cp $HOME/rpmbuild/SOURCES/DetailPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/DetailPage.qml
cp $HOME/rpmbuild/SOURCES/harbour-hstoreclient.desktop %{buildroot}%{_datadir}/applications/%{name}.desktop
cp $HOME/rpmbuild/SOURCES/harbour-hstoreclient.png %{buildroot}%{_datadir}/icons/hicolor/86x86/apps/%{name}.png
%files
%defattr(-,root,root,-)
%{_datadir}/%{name}/qml/%{name}.qml
%{_datadir}/%{name}/qml/pages/*.qml
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/86x86/apps/%{name}.png