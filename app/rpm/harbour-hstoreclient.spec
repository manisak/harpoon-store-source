Name:       harbour-hstoreclient
Summary:    Harpoon Store client - browse and install SailfishOS apps
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
C=`pwd`
mkdir -p $HOME/rpmbuild/SOURCES/harbour-hstoreclient-0.1.0
cp $HOME/rpmbuild/SOURCES/*.qml $HOME/rpmbuild/SOURCES/*.png harbour-hstoreclient-0.1.0/ 2>&1 | true
cd $HOME/rpmbuild/SOURCES
ls -la .
tar czf $HOME/rpmbuild/SOURCES/harbour-hstoreclient-0.1.0.tar.gz harbour-hstoreclient-0.1.0
ls -la $HOME/rpmbuild/SOURCES/harbour-hstoreclient-0.1.0.tar.gz
cd $C
%setup -q -n harbour-hstoreclient-0.1.0 -a 0

%build

%install
mkdir -p %{buildroot}%{_datadir}/%{name}/qml/pages
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/86x86/apps
cp harbour-hstoreclient.qml %{buildroot}%{_datadir}/%{name}/qml/harbour-hstoreclient.qml
cp FirstPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/FirstPage.qml
cp DetailPage.qml %{buildroot}%{_datadir}/%{name}/qml/pages/DetailPage.qml
cp $HOME/rpmbuild/SOURCES/harbour-hstoreclient.desktop %{buildroot}%{_datadir}/applications/harbour-hstoreclient.desktop
cp FirstPage.png 2>/dev/null || true
cp harbour-hstoreclient.png %{buildroot}%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png

%files
%defattr(-,root,root,-)
%{_datadir}/%{name}/qml/harbour-hstoreclient.qml
%{_datadir}/%{name}/qml/pages/FirstPage.qml
%{_datadir}/%{name}/qml/pages/DetailPage.qml
%{_datadir}/applications/harbour-hstoreclient.desktop
%{_datadir}/icons/hicolor/86x86/apps/harbour-hstoreclient.png