Name:       harbour-hstoreclient
Summary:    Harpoon Store client - browse and install SailfishOS apps
%description
Harpoon Store client: browse community Sailfish OS apps and install
them with Harpoon via a single tap.

Version:    0.1.0
Release:    1
Group:      Applications/Internet
License:    MIT
URL:        https://harpoon-store.manisak.com
BuildArch:  noarch
Requires:   sailfish-qml

Source0:    harbour-hstoreclient-0.1.0.tar.gz
Source1:    harbour-hstoreclient.desktop

%prep
cd $HOME/rpmbuild/SOURCES
mkdir harbour-hstoreclient-0.1.0
cp *.qml *.png harbour-hstoreclient.desktop harbour-hstoreclient-0.1.0/
tar czf harbour-hstoreclient-0.1.0.tar.gz harbour-hstoreclient-0.1.0
%setup -q -n harbour-hstoreclient-0.1.0

%build

%install
mkdir -p %{buildroot}%{_datadir}/%{name}/qml/pages
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/86x86/apps
cp harbour-hstoreclient.qml %{buildroot}%{_datadir}/%{name}/qml/harbour-hstoreclient.qml
cp FirstPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/FirstPage.qml
cp DetailPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/DetailPage.qml
cp harbour-hstoreclient.desktop %{buildroot}%{_datadir}/applications/harbour-hstoreclient.desktop
cp harbour-hstoreclient.png %{buildroot}%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png

%files
%defattr(-,root,root,-)
%{_datadir}/%{name}/qml/harbour-hstoreclient.qml
%{_datadir}/%{name}/qml/pages/FirstPage.qml
%{_datadir}/%{name}/qml/pages/DetailPage.qml
%{_datadir}/applications/harbour-hstoreclient.desktop
%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png